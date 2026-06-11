import pytest
from fastapi.testclient import TestClient
from app.main import app


client = TestClient(app)


def test_token_and_protected():
    resp = client.post("/auth/token", data={"username": "alice", "password": "alicepass"})
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data

    token = data["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    # access my bookings
    r = client.get("/bookings/me", headers=headers)
    assert r.status_code == 200
