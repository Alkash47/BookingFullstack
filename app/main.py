from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import date, timedelta, time
from . import models, crud, auth, database, schemas

app = FastAPI(title="Meeting Room Booking")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")


async def get_current_user(token: str = Depends(oauth2_scheme), session: AsyncSession = Depends(database.get_session)):
    """Получить текущего пользователя по JWT-токену в зависимости от запроса."""
    payload = auth.decode_access_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authentication credentials")
    username = payload["sub"]
    user = await crud.get_user_by_username(session, username)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


@app.on_event("startup")
async def on_startup():
    """Инициализация базы данных и создание начальных данных при старте приложения."""
    await database.init_db()
    async with database.AsyncSessionLocal() as session:
        result = await session.execute(select(models.Room))
        if not result.scalars().first():
            await crud.create_room(session, "Room A", "09:00-11:00,13:00-16:00")
            await crud.create_room(session, "Room B", "09:00-11:00,12:00-14:00")
        if not await crud.get_user_by_username(session, "admin"):
            hashed = auth.get_password_hash("adminpass")
            await crud.create_user(session, "admin", hashed, "Administrator", is_admin=True)
        if not await crud.get_user_by_username(session, "alice"):
            hashed = auth.get_password_hash("alicepass")
            await crud.create_user(session, "alice", hashed, "Alice Employee", is_admin=False)


@app.post("/auth/token", response_model=schemas.Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), session: AsyncSession = Depends(database.get_session)):
    """Аутентифицировать пользователя и вернуть JWT-токен доступа."""
    user = await crud.get_user_by_username(session, form_data.username)
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect username or password")
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(data={"sub": user.username}, expires_delta=access_token_expires)
    return {"access_token": access_token, "token_type": "bearer"}


@app.get("/rooms")
async def list_rooms(date: date, session: AsyncSession = Depends(database.get_session)):
    """Получить список комнат и занятых слотов на заданную дату."""
    rooms = await crud.list_rooms(session)
    result = []
    for r in rooms:
        booked = await session.execute(select(models.Booking).where(models.Booking.room_id == r.id, models.Booking.date == date))
        booked_slots = [b.slot_id for b in booked.scalars().all()]
        slots = [s.strip() for s in r.slots.split(",")]
        result.append({"id": r.id, "name": r.name, "slots": slots, "booked_slots": booked_slots})
    return result


@app.post("/bookings", status_code=201)
async def create_booking(
    b: schemas.BookingCreate,
    current_user: models.User = Depends(get_current_user),
    session: AsyncSession = Depends(database.get_session),
):
    """Создать новое бронирование комнаты для авторизованного пользователя."""
    conflict = await crud.find_booking_conflict(session, b.room_id, b.date, b.slot_id)
    if conflict:
        raise HTTPException(status_code=409, detail="Slot already booked")
    booking = await crud.create_booking(session, current_user.id, b.room_id, b.date, b.slot_id)
    return {"id": booking.id, "room_id": booking.room_id, "user_id": booking.user_id, "date": booking.date, "slot_id": booking.slot_id}


@app.get("/bookings/me")
async def my_bookings(current_user: models.User = Depends(get_current_user), session: AsyncSession = Depends(database.get_session)):
    """Получить список бронирований текущего пользователя."""
    bookings = await session.execute(select(models.Booking).where(models.Booking.user_id == current_user.id))
    return bookings.scalars().all()


@app.delete("/bookings/{booking_id}")
async def delete_booking(booking_id: int, current_user: models.User = Depends(get_current_user), session: AsyncSession = Depends(database.get_session)):
    """Удалить бронирование, если это владелец или админ."""
    booking = await session.get(models.Booking, booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not permitted to delete this booking")
    await session.delete(booking)
    await session.commit()
    return {"status": "deleted"}
