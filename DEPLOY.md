# 🚀 Деплой на Railway — пошаговая инструкция

## Шаг 1 — Загрузить код на GitHub

Открой терминал в папке `BookingServiceForCFT` и выполни:

```bash
git add .
git commit -m "Prepare for Railway deployment"
git push
```

Если репозитория ещё нет — создай на **github.com**, затем:
```bash
git remote add origin https://github.com/ВАШ_ЛОГИН/ВАШ_РЕПО.git
git push -u origin main
```

> **ВАЖНО:** Убедись что `.env` и `dev.db` **НЕ попали** в git — они в `.gitignore`.

---

## Шаг 2 — Создать проект на Railway

1. Зайди на **[railway.app](https://railway.app)** → зарегистрируйся через GitHub
2. Нажми **"New Project"**
3. Выбери **"Deploy from GitHub repo"**
4. Выбери твой репозиторий → Railway начнёт деплой

---

## Шаг 3 — Добавить PostgreSQL

1. В проекте нажми **"+ New Service"**
2. Выбери **"Database → PostgreSQL"**
3. Подожди пока создастся

---

## Шаг 4 — Настроить переменные окружения

В настройках **веб-сервиса** (не базы!) → вкладка **"Variables"** → добавь:

| Переменная | Значение |
|-----------|---------|
| `SECRET_KEY` | Сгенерируй: `python -c "import secrets; print(secrets.token_hex(32))"` |
| `ADMIN_PASSWORD` | Придумай надёжный пароль |
| `DATABASE_URL` | Скопируй из сервиса PostgreSQL (кнопка Copy Snippet) |
| `RAILWAY_ENVIRONMENT` | `production` |

---

## Шаг 5 — Проверить деплой

Railway даст URL вида `https://xxxxx.up.railway.app`

- Сайт: `https://xxxxx.up.railway.app`
- Админка: логин `admin`, пароль = твой `ADMIN_PASSWORD`

Если что-то пошло не так — смотри логи: вкладка **Deployments → View Logs**
