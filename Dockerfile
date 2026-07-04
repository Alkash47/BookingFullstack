FROM python:3.11-slim

WORKDIR /app

# Копируем только requirements для кэширования слоёв
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# Копируем весь проект
COPY . /app

# Даём скрипту права на выполнение
RUN chmod +x /app/start.sh

# Открываем порт
EXPOSE 8000

# Запуск через shell-скрипт (гарантированно раскрывает $PORT)
CMD ["/app/start.sh"]
