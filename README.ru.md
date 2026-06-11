# Сервис бронирования переговорных комнат

Простой сервис на FastAPI для бронирования переговорных комнат.

### Запуск локально (SQLite):

```bash
python -m pip install poetry
poetry install
poetry run uvicorn app.main:app --reload
```

### Запуск в Docker (SQLite внутри контейнера):

```bash
docker build -t meeting-booking .
docker run -p 8000:8000 meeting-booking
```

### Запуск с Postgres через docker-compose:

```bash
docker compose up --build
```

Пользователи по умолчанию, создаваемые при старте: `admin`/`adminpass`, `alice`/`alicepass`.

Аутентификация: получите токен через POST-запрос на `/auth/token`, передав `username` и `password` в виде form-data.

Пример создания бронирования (с bearer-токеном): POST `/bookings` с JSON-телом `{ "room_id": 1, "date": "2026-06-06", "slot_id": 0 }`