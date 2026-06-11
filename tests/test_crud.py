import pytest
from app import crud, auth
from sqlalchemy.ext.asyncio import AsyncSession

pytestmark = pytest.mark.asyncio


async def test_create_and_get_user(db_session: AsyncSession):
    """Тест прямого создания и получения пользователя через CRUD-функции."""
    username = "testuser_crud"
    password = "testpassword"
    hashed_password = auth.get_password_hash(password)

    # Создаем пользователя
    user_in = await crud.create_user(db_session, username, hashed_password, "Test User CRUD")
    assert user_in.username == username

    # Получаем пользователя
    user_out = await crud.get_user_by_username(db_session, username)
    assert user_out is not None
    assert user_out.username == username
    assert auth.verify_password(password, user_out.hashed_password)