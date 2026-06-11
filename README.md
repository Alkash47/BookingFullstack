# Meeting Room Booking Service

Simple FastAPI service for booking meeting rooms.

Run locally (SQLite):

```bash
python -m pip install poetry
poetry install
poetry run uvicorn app.main:app --reload
```

Run in Docker (SQLite inside container):

```bash
docker build -t meeting-booking .
docker run -p 8000:8000 meeting-booking
```

Run with Postgres via docker-compose:

```bash
docker compose up --build
```

Default users created on startup: `admin`/`adminpass`, `alice`/`alicepass`.

Auth: obtain token via POST `/auth/token` with form fields `username` and `password`.

Example create booking (bearer token): POST `/bookings` JSON `{ "room_id": 1, "date": "2026-06-06", "slot_id": 0 }`
