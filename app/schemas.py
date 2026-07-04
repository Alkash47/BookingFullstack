from datetime import date, time
from pydantic import BaseModel
from typing import Optional


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    username: Optional[str] = None


class UserCreate(BaseModel):
    username: str
    password: str
    full_name: Optional[str] = None
    is_admin: Optional[bool] = False


class UserRegister(BaseModel):
    username: str
    password: str
    full_name: Optional[str] = None


class BookingCreate(BaseModel):
    room_id: int
    date: date
    start_time: time
    end_time: time


class SlotOut(BaseModel):
    id: int
    start_time: time
    end_time: time

    class Config:
        from_attributes = True


class RoomCreate(BaseModel):
    name: str
    slots: Optional[str] = "09:00-10:00,10:00-11:00,11:00-12:00,12:00-13:00,13:00-14:00,14:00-15:00,15:00-16:00,16:00-17:00,17:00-18:00,18:00-19:00,19:00-20:00,20:00-21:00"
    price: int = 1000
    description: Optional[str] = "Современная переговорная комната"
    capacity: Optional[str] = "1 - 10 человек"
    image_url: Optional[str] = "images/glass_box.png"


class RoomUpdate(BaseModel):
    name: Optional[str] = None
    price: Optional[int] = None
    description: Optional[str] = None
    capacity: Optional[str] = None
    image_url: Optional[str] = None
