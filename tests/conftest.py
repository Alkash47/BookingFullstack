import asyncio
import pytest
import os


@pytest.fixture(scope="session", autouse=True)
def setup_database():
    """Очистить БД перед тестами и инициализировать её."""
    db_path = os.path.join(os.path.dirname(__file__), "..", "dev.db")
    if os.path.exists(db_path):
        os.remove(db_path)
    
    from app.database import init_db
    asyncio.run(init_db())
    
    from app.database import AsyncSessionLocal
    from app.models import Room
    from app import crud, auth
    from sqlalchemy import select
    
    async def init_data():
        async with AsyncSessionLocal() as session:
            await crud.create_room(session, "Room A", "09:00-11:00,13:00-16:00")
            await crud.create_room(session, "Room B", "09:00-11:00,12:00-14:00")
            
            hashed_admin = auth.get_password_hash("adminpass")
            await crud.create_user(session, "admin", hashed_admin, "Administrator", is_admin=True)
            
            hashed_alice = auth.get_password_hash("alicepass")
            await crud.create_user(session, "alice", hashed_alice, "Alice Employee", is_admin=False)
    
    asyncio.run(init_data())
    yield
