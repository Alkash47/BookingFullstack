from datetime import date
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


class BookingCreate(BaseModel):
    room_id: int
    date: date
    slot_id: int
