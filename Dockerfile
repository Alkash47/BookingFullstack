FROM python:3.11-slim

WORKDIR /app

# Копируем только requirements для кэширования слоёв
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# Копируем весь проект
COPY . /app

# Открываем порт (Railway сам подставит $PORT)
EXPOSE 8000

# Запуск — Railway передаёт PORT через переменную окружения
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
