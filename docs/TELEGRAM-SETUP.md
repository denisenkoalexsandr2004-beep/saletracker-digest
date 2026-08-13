# Подключение Telegram-бота

## 1. Создать бота

1. Откройте в Telegram официальный бот `@BotFather`.
2. Отправьте команду `/newbot`.
3. Название: `Дайджест Платформы Сейл Трекер`.
4. Придумайте username, оканчивающийся на `bot`.
5. BotFather выдаст токен. Он даёт полный контроль над ботом: не отправляйте
   его в переписках и не добавляйте в git.

## 2. Добавить локальные переменные

Создайте в корне проекта файл `.env.local`:

```dotenv
NEXT_PUBLIC_APP_URL=http://localhost:3000
TELEGRAM_BOT_USERNAME=username_без_символа_@
TELEGRAM_BOT_TOKEN=токен_из_BotFather
TELEGRAM_WEBHOOK_SECRET=случайная_строка_не_короче_16_символов
TELEGRAM_ADMIN_SECRET=случайная_строка_не_короче_24_символов
```

На macOS два секрета можно создать командами:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

После изменения `.env.local` перезапустите приложение.

## 3. Локальный пилот через polling

Telegram не может вызвать `localhost` через webhook. Для локального пилота
используется защищённый polling endpoint:

```bash
curl -X POST http://localhost:3000/api/telegram/polls \
  -H "Authorization: Bearer ЗНАЧЕНИЕ_TELEGRAM_ADMIN_SECRET"
```

Последовательность:

1. Настройте подписку на главной странице.
2. Нажмите «Подключить Telegram».
3. Нажмите Start в открывшемся боте.
4. Выполните polling-запрос выше.
5. Бот привяжет чат и отправит первый тестовый выпуск.

После привязки доступны команды:

- `/digest` — получить тестовый выпуск;
- `/settings` — показать настройки;
- `/help` — список команд.

Каждую новую команду в локальном режиме нужно забрать повторным
polling-запросом. На публичном сервере это происходит автоматически.

## 4. Production webhook

Для webhook нужен публичный HTTPS-адрес приложения. После размещения:

1. Измените `NEXT_PUBLIC_APP_URL` на production URL.
2. Добавьте все четыре Telegram-переменные в настройках хостинга.
3. Выполните:

```bash
curl -X POST https://ВАШ-ДОМЕН/api/telegram/configuration \
  -H "Authorization: Bearer ЗНАЧЕНИЕ_TELEGRAM_ADMIN_SECRET"
```

Endpoint проверит токен через `getMe`, сопоставит username, создаст команды и
зарегистрирует webhook с защитным заголовком
`X-Telegram-Bot-Api-Secret-Token`.

Статус приложения:

```text
GET /api/telegram/status
```

## Ограничение текущего этапа

Подписки и Telegram chat ID пока находятся в памяти процесса. Для реального
массового пилота их необходимо перенести в PostgreSQL, иначе данные могут
потеряться после перезапуска или переключения serverless-инстанса.
