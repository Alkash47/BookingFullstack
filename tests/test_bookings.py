from fastapi.testclient import TestClient
from app.main import app
import datetime


client = TestClient(app)


def get_token(username="alice", password="alicepass"):
    r = client.post("/auth/token", data={"username": username, "password": password})
    return r.json()["access_token"]


def test_create_and_delete_booking():
    token = get_token()
    headers = {"Authorization": f"Bearer {token}"}
    booking = {"room_id": 1, "date": datetime.date.today().isoformat(), "slot_id": 1}
    r = client.post("/bookings", json=booking, headers=headers)
    assert r.status_code == 201
    data = r.json()
    booking_id = data["id"]
    admin_token = get_token("admin", "adminpass")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    rdel = client.delete(f"/bookings/{booking_id}", headers=admin_headers)
    assert rdel.status_code == 200
