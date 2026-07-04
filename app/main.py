import os
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import date, timedelta, time
from . import models, crud, auth, database, schemas

app = FastAPI(title="Meeting Room Booking")


@app.get("/health")
async def health_check():
    """Healthcheck для Railway — возвращает статус сервиса."""
    return {"status": "ok"}





# CORS — разрешаем запросы с фронтенда
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

    # Выполняем автомиграцию для добавления новых колонок в sqlite если их нет
    from sqlalchemy import text
    async with database.engine.begin() as conn:
        for col, col_type, default_val in [
            ("price", "INTEGER", "1000"),
            ("description", "VARCHAR", "'Современная переговорная комната'"),
            ("capacity", "VARCHAR", "'1 - 10 человек'"),
            ("image_url", "VARCHAR", "'images/glass_box.png'")
        ]:
            try:
                await conn.execute(text(f"ALTER TABLE room ADD COLUMN {col} {col_type} DEFAULT {default_val}"))
            except Exception:
                pass # Колонка уже существует

        # Автомиграция для таблицы booking
        for col, col_type, default_val in [
            ("start_time", "TIME", "NULL"),
            ("end_time", "TIME", "NULL")
        ]:
            try:
                await conn.execute(text(f"ALTER TABLE booking ADD COLUMN {col} {col_type} DEFAULT {default_val}"))
            except Exception:
                pass

        # Инициализируем старые бронирования временем из слотов
        try:
            await conn.execute(text("""
                UPDATE booking 
                SET 
                    start_time = (SELECT start_time FROM slot WHERE slot.id = booking.slot_id),
                    end_time = (SELECT end_time FROM slot WHERE slot.id = booking.slot_id)
                WHERE slot_id IS NOT NULL AND start_time IS NULL
            """))
        except Exception:
            pass

    async with database.AsyncSessionLocal() as session:
        # Создание слотов (почасовые интервалы с 09:00 до 21:00)
        result = await session.execute(select(models.Slot))
        if not result.scalars().first():
            for hour in range(9, 21):
                slot = models.Slot(start_time=time(hour, 0), end_time=time(hour + 1, 0))
                session.add(slot)
            await session.commit()

        # Создание комнат, соответствующих лендингу NEXUS
        result = await session.execute(select(models.Room))
        if not result.scalars().first():
            slots_str = ",".join([f"{h:02d}:00-{h+1:02d}:00" for h in range(9, 21)])
            await crud.create_room(
                session, 
                "Focus Room", 
                slots_str,
                price=800,
                description="Минималистичное и уютное пространство, идеально подходящее для тет-а-тет интервью, звонков с клиентами или сфокусированной индивидуальной работы без постороннего шума.",
                capacity="1 - 4 человека",
                image_url="images/deep_focus.png"
            )
            await crud.create_room(
                session, 
                "Collaboration Hub", 
                slots_str,
                price=1500,
                description="Просторная зона, спроектированная специально для командных мозговых штурмов, демонстрации презентаций и комфортного гибридного взаимодействия с удаленными сотрудниками.",
                capacity="5 - 10 человек",
                image_url="images/glass_box.png"
            )
            await crud.create_room(
                session, 
                "Executive Boardroom", 
                slots_str,
                price=3000,
                description="Флагманский зал заседаний с эксклюзивной мебелью из массива дерева, интегрированной мультимедиа-системой и климатической установкой премиум-класса для важных решений.",
                capacity="До 20 человек",
                image_url="images/boardroom.png"
            )

        # Начальные пользователи
        # Пароли берутся из переменных окружения (см. .env)
        admin_password = os.getenv("ADMIN_PASSWORD", "adminpass")
        if not await crud.get_user_by_username(session, "admin"):
            hashed = auth.get_password_hash(admin_password)
            await crud.create_user(session, "admin", hashed, "Administrator", is_admin=True)
        if not await crud.get_user_by_username(session, "alice"):
            hashed = auth.get_password_hash("alicepass")
            await crud.create_user(session, "alice", hashed, "Alice Employee", is_admin=False)


# ==========================================
# AUTH ENDPOINTS
# ==========================================

@app.post("/auth/token", response_model=schemas.Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), session: AsyncSession = Depends(database.get_session)):
    """Аутентифицировать пользователя и вернуть JWT-токен доступа."""
    user = await crud.get_user_by_username(session, form_data.username)
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect username or password")
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(data={"sub": user.username}, expires_delta=access_token_expires)
    return {"access_token": access_token, "token_type": "bearer"}


@app.post("/auth/register", status_code=201)
async def register_user(user_data: schemas.UserRegister, session: AsyncSession = Depends(database.get_session)):
    """Зарегистрировать нового пользователя."""
    existing = await crud.get_user_by_username(session, user_data.username)
    if existing:
        raise HTTPException(status_code=409, detail="Username already exists")
    hashed = auth.get_password_hash(user_data.password)
    user = await crud.create_user(session, user_data.username, hashed, user_data.full_name)
    # Сразу выдаём токен после регистрации
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(data={"sub": user.username}, expires_delta=access_token_expires)
    return {"access_token": access_token, "token_type": "bearer", "user": {"id": user.id, "username": user.username, "full_name": user.full_name}}


@app.get("/auth/me")
async def get_me(current_user: models.User = Depends(get_current_user)):
    """Получить информацию о текущем пользователе."""
    return {"id": current_user.id, "username": current_user.username, "full_name": current_user.full_name, "is_admin": current_user.is_admin}


# ==========================================
# ROOMS & SLOTS ENDPOINTS
# ==========================================

@app.get("/rooms")
async def list_rooms(date: date, session: AsyncSession = Depends(database.get_session)):
    """Получить список комнат и занятых интервалов на заданную дату."""
    rooms = await crud.list_rooms(session)
    result = []
    for r in rooms:
        booked = await session.execute(select(models.Booking).where(models.Booking.room_id == r.id, models.Booking.date == date))
        booked_intervals = [{
            "id": b.id,
            "start": b.start_time.strftime("%H:%M") if b.start_time else "09:00",
            "end": b.end_time.strftime("%H:%M") if b.end_time else "10:00"
        } for b in booked.scalars().all()]
        slots = [s.strip() for s in r.slots.split(",")]
        result.append({
            "id": r.id,
            "name": r.name,
            "slots": slots,
            "booked_intervals": booked_intervals,
            "price": r.price,
            "description": r.description,
            "capacity": r.capacity,
            "image_url": r.image_url
        })
    return result


@app.get("/slots", response_model=list[schemas.SlotOut])
async def list_slots(session: AsyncSession = Depends(database.get_session)):
    """Получить список всех временных слотов."""
    slots = await crud.list_slots(session)
    return slots


async def verify_admin(current_user: models.User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin privileges required")
    return current_user


# ==========================================
# ADMIN ENDPOINTS (ROOM MANAGEMENT)
# ==========================================

@app.post("/admin/rooms", status_code=201)
async def admin_create_room(
    room_in: schemas.RoomCreate,
    admin: models.User = Depends(verify_admin),
    session: AsyncSession = Depends(database.get_session)
):
    """Создать новую комнату (только для администраторов)."""
    # Check if already exists
    existing = await session.execute(select(models.Room).where(models.Room.name == room_in.name))
    if existing.scalars().first():
        raise HTTPException(status_code=400, detail="Room name already exists")
    
    slots_str = room_in.slots
    room = await crud.create_room(
        session,
        name=room_in.name,
        slots=slots_str,
        price=room_in.price,
        description=room_in.description,
        capacity=room_in.capacity,
        image_url=room_in.image_url
    )
    return room


@app.put("/admin/rooms/{room_id}")
async def admin_update_room(
    room_id: int,
    room_in: schemas.RoomUpdate,
    admin: models.User = Depends(verify_admin),
    session: AsyncSession = Depends(database.get_session)
):
    """Обновить параметры комнаты (только для администраторов)."""
    room = await crud.get_room(session, room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    updated = await crud.update_room(session, room, room_in.dict(exclude_unset=True))
    return updated


@app.delete("/admin/rooms/{room_id}")
async def admin_delete_room(
    room_id: int,
    admin: models.User = Depends(verify_admin),
    session: AsyncSession = Depends(database.get_session)
):
    """Удалить комнату (только для администраторов)."""
    room = await crud.get_room(session, room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    # Delete associated bookings first
    from sqlalchemy import delete
    await session.execute(delete(models.Booking).where(models.Booking.room_id == room_id))
    
    await crud.delete_room(session, room)
    return {"status": "success", "message": f"Room {room_id} deleted"}


# ==========================================
# BOOKING ENDPOINTS
# ==========================================

@app.post("/bookings", status_code=201)
async def create_booking(
    b: schemas.BookingCreate,
    current_user: models.User = Depends(get_current_user),
    session: AsyncSession = Depends(database.get_session),
):
    """Создать новое бронирование комнаты для авторизованного пользователя."""
    conflict = await crud.find_booking_conflict(session, b.room_id, b.date, b.start_time, b.end_time)
    if conflict:
        raise HTTPException(status_code=409, detail="Time interval already booked")
    booking = await crud.create_booking(session, current_user.id, b.room_id, b.date, b.start_time, b.end_time)
    return {
        "id": booking.id,
        "room_id": booking.room_id,
        "user_id": booking.user_id,
        "date": str(booking.date),
        "start_time": booking.start_time.strftime("%H:%M"),
        "end_time": booking.end_time.strftime("%H:%M")
    }


@app.get("/bookings/me")
async def my_bookings(current_user: models.User = Depends(get_current_user), session: AsyncSession = Depends(database.get_session)):
    """Получить список бронирований текущего пользователя с названиями комнат и временем."""
    bookings = await session.execute(select(models.Booking).where(models.Booking.user_id == current_user.id))
    result = []
    for b in bookings.scalars().all():
        room = await session.get(models.Room, b.room_id)
        result.append({
            "id": b.id,
            "room_id": b.room_id,
            "room_name": room.name if room else "Unknown",
            "date": str(b.date),
            "slot_start": b.start_time.strftime("%H:%M") if b.start_time else "09:00",
            "slot_end": b.end_time.strftime("%H:%M") if b.end_time else "10:00",
        })
    return result


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


# Serving static files and frontend
static_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "static"))
images_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "images"))

# Serve the images from the main images folder
if os.path.exists(images_dir):
    app.mount("/images", StaticFiles(directory=images_dir), name="images")

# Serve other static files (index.html, styles.css, app.js) fallback at root
if os.path.exists(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
