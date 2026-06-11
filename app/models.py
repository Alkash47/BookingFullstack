from typing import Optional
from datetime import date, time
from sqlmodel import SQLModel, Field, Relationship


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(index=True, unique=True)
    full_name: Optional[str]
    hashed_password: str
    is_admin: bool = False
    bookings: list["Booking"] = Relationship(back_populates="user")


class Slot(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    start_time: time
    end_time: time
    bookings: list["Booking"] = Relationship(back_populates="slot")


class Room(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True, unique=True)
    slots: str  # JSON or comma-separated predefined slots
    bookings: list["Booking"] = Relationship(back_populates="room")


class Booking(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    room_id: int = Field(foreign_key="room.id")
    user_id: int = Field(foreign_key="user.id")
    date: date
    slot_id: int = Field(foreign_key="slot.id")

    user: Optional[User] = Relationship(back_populates="bookings")
    room: Optional[Room] = Relationship(back_populates="bookings")
    slot: Optional[Slot] = Relationship(back_populates="bookings")
