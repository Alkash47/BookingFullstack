from datetime import datetime, timedelta, timezone
from typing import Optional
import os
from jose import JWTError, jwt
from passlib.context import CryptContext

SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    # В локальной разработке разрешаем дефолтный ключ, в продакшене — нет
    import sys
    if os.getenv("RAILWAY_ENVIRONMENT") or os.getenv("PRODUCTION"):
        raise RuntimeError("SECRET_KEY environment variable is required in production!")
    SECRET_KEY = "local-dev-insecure-key"

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60


# Используем pbkdf2_sha256, чтобы избежать проблем с бинарными зависимостями bcrypt на некоторых системах
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def verify_password(plain_password, hashed_password):
    """Проверить, совпадает ли введённый пароль с хешированной версией."""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password):
    """Получить хеш пароля для хранения в базе данных."""
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Создать JWT-токен доступа с указанием срока действия."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def decode_access_token(token: str):
    """Декодировать JWT-токен и вернуть полезную нагрузку, если он валиден."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None
