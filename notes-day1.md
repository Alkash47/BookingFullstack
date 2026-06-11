# Notes — Day 1

Краткий чеклист на день:

- Проверка окружения:
  - python --version  (нужно 3.11+)
  - poetry --version

- Перейти в проект:
  - cd "C:\Users\1hayt\OneDrive\Desktop\идеальное тестовое"

- Установить зависимости:
  - poetry install --no-root

- Запуск dev-сервера:
  - poetry run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
  - Открыть http://localhost:8000/docs

- Практика:
  1) Получить токен:
     curl -X POST -F "username=alice" -F "password=alicepass" http://localhost:8000/auth/token
     скопировать access_token
  2) Вызвать защищённый эндпоинт:
     curl -H "Authorization: Bearer <TOKEN>" http://localhost:8000/bookings/me

- Отладка:
  - Если требуется multipart: poetry add python-multipart
  - Для хеширования паролей: passlib (pbkdf2_sha256)

- Рефлексия (15–30 мин): запишите ответы в notes-day1.md или блокноте:
  - Что такое маршрут? Что такое Pydantic-модель?
  - Как получать тело запроса и как используется JWT?

Ресурсы:
- FastAPI Tutorial — User Guide (router, path, body, dependency)
- Pydantic — модели и валидация

Ожидаемый результат: локально запущенный сервер, полученный JWT и успешный вызов одного защищённого эндпоинта.
