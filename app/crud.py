from sqlalchemy.exc import IntegrityError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import date
from .models import User, Room, Booking


async def get_user_by_username(session: AsyncSession, username: str):
    """Найти пользователя по имени пользователя."""
    result = await session.execute(select(User).where(User.username == username))
    return result.scalars().first()


async def create_user(session: AsyncSession, username: str, hashed_password: str, full_name: str | None = None, is_admin: bool = False):
    """Создать нового пользователя в базе данных."""
    user = User(username=username, hashed_password=hashed_password, full_name=full_name, is_admin=is_admin)
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


async def list_rooms(session: AsyncSession):
    """Получить список всех доступных комнат."""
    result = await session.execute(select(Room))
    return result.scalars().all()


async def get_room(session: AsyncSession, room_id: int):
    """Получить комнату по её идентификатору."""
    return await session.get(Room, room_id)


async def create_room(session: AsyncSession, name: str, slots: str):
    """Создать новую комнату и сохранить её в базе данных."""
    room = Room(name=name, slots=slots)
    session.add(room)
    await session.commit()
    await session.refresh(room)
    return room


async def create_booking(session: AsyncSession, user_id: int, room_id: int, date_: date, slot_id: int):
    """Создать бронирование комнаты на указанный слот."""
    booking = Booking(user_id=user_id, room_id=room_id, date=date_, slot_id=slot_id)
    session.add(booking)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise
    await session.refresh(booking)
    return booking


async def find_booking_conflict(session: AsyncSession, room_id: int, date_: date, slot_id: int):
    """Проверить, существует ли конфликт бронирования для заданного слота."""
    result = await session.execute(
        select(Booking).where(Booking.room_id == room_id, Booking.date == date_, Booking.slot_id == slot_id)
    )
    return result.scalars().first()
