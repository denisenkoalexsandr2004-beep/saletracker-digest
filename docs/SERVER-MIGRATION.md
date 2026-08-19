# Перенос SaleTracker Digest на собственный сервер

Документ описывает переезд с Vercel на VPS с постоянным Node-процессом.

## Зачем

Serverless-платформа замораживает процесс сразу после ответа. Из-за этого:

- фоновый цикл Telegram-поллинга умирает, не начавшись;
- отправка многочастного выпуска упирается в лимит времени функции;
- при таймауте функции апдейт Telegram уже помечен обработанным, повтор
  отбрасывается как дубль, и подписчик не получает выпуск;
- глобальное состояние (offset поллинга, пул соединений) не переживает
  переключение инстансов.

Постоянный процесс снимает все четыре ограничения.

## 1. Сервер

Достаточно Hetzner Cloud **CX22** — 2 vCPU, 4 ГБ RAM, 40 ГБ NVMe, около
4.35 € в месяц. Локация Хельсинки или Нюрнберг: оттуда доступны OpenAI,
Telegram и российские сайты-источники одновременно. Российский VPS не
подойдёт без прокси — OpenAI из РФ напрямую не работает.

ОС: Ubuntu 24.04 LTS.

## 2. Подготовка

```bash
adduser --disabled-password --gecos "" saletracker
apt update && apt install -y nginx certbot python3-certbot-nginx git curl
timedatectl set-timezone UTC

curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt install -y nodejs

install -d -o saletracker -g saletracker /srv/saletracker
```

Дальше — от пользователя `saletracker`:

```bash
git clone https://github.com/denisenkoalexsandr2004-beep/saletracker-digest.git /srv/saletracker
cd /srv/saletracker
npm ci
```

## 3. База данных

Neon переносить не обязательно — он работает и на бесплатном тарифе. Но
текущий проект расположен в `us-east-2`, а сервер будет в Европе: каждый
запрос получит около 100 мс задержки. Лучше создать проект Neon в европейском
регионе и перенести данные:

```bash
pg_dump "$OLD_DATABASE_URL" --no-owner --no-privileges -Fc -f dump.pgc
pg_restore --no-owner --no-privileges -d "$NEW_DATABASE_URL" dump.pgc
```

Схему на чистой базе создают миграции: `npm run db:migrate`.

## 4. Переменные окружения

`/srv/saletracker/.env.production`, права `600`, владелец `saletracker`.
Значения берутся из текущего проекта Vercel, кроме `APP_URL` — он меняется на
новый домен.

```dotenv
NODE_ENV=production
APP_URL=https://digest.example.ru
DATABASE_URL=postgresql://...
DB_POOL_SIZE=5
ADMIN_PASSWORD=...
SESSION_SECRET=...
CRON_SECRET=...
TELEGRAM_BOT_USERNAME=digestsaletracker_bot
TELEGRAM_BOT_TOKEN=...
TELEGRAM_WEBHOOK_SECRET=...
TELEGRAM_ADMIN_SECRET=...
OPENAI_API_KEY=...
OPENAI_NEWS_MODEL=gpt-5.6-sol
NEWS_INGESTION_MAX_AGE_MINUTES=150
NEWS_APPROVED_SOURCE_MAX_AGE_HOURS=48
```

Отдельно положите секрет планировщика для cron:

```bash
printf '%s' "$CRON_SECRET" > /srv/saletracker/.cron-secret
chmod 600 /srv/saletracker/.cron-secret
```

## 5. Сервис, nginx и сертификат

Файлы лежат в каталоге `deploy/`:

```bash
cp deploy/saletracker.service /etc/systemd/system/
systemctl daemon-reload

npm run build
systemctl enable --now saletracker

cp deploy/nginx.conf /etc/nginx/sites-available/saletracker
ln -s /etc/nginx/sites-available/saletracker /etc/nginx/sites-enabled/
# замените digest.example.ru на свой домен в обоих файлах
nginx -t && systemctl reload nginx

certbot --nginx -d digest.example.ru
```

## 6. Telegram

Домен изменился, поэтому webhook нужно перерегистрировать — иначе Telegram
продолжит стучаться на Vercel:

```bash
curl -fsS -X POST \
  -H "Authorization: Bearer $TELEGRAM_ADMIN_SECRET" \
  https://digest.example.ru/api/telegram/configuration
```

Проверка: `curl https://digest.example.ru/api/telegram/status` — поле
`status` должно быть `ready-for-webhook`.

## 7. Планировщик

```bash
crontab -u saletracker deploy/crontab   # предварительно подставьте свой домен
```

После этого workflow `.github/workflows/scheduled-jobs.yml` можно отключить,
чтобы задания не запускались дважды. Идемпотентность защищает от дублей, но
двойные вызовы всё равно бессмысленны.

## 8. Проверка

```bash
curl https://digest.example.ru/api/health   # ожидается mode: persistent
curl https://digest.example.ru/api/ready    # ожидается status: ok
```

`/api/ready` отдаёт `200` только при полном контуре: база, отдельная защита
админки, HTTPS, Telegram, планировщик, AI и свежие данные. Пока сбор новостей
не отработал, проверка `newsFreshness` останется `stale` — это ожидаемо.

Живая проверка: создать подписку на сайте, нажать Start в боте, убедиться,
что пришли приветствие и выпуск.

## 9. Выкатка обновлений

```bash
/srv/saletracker/deploy/release.sh
```

Скрипт подтягивает `main`, применяет миграции, собирает проект, перезапускает
сервис и ждёт ответа `/api/health`.

## 10. Откат

Домен на Vercel остаётся рабочим. Чтобы вернуться, достаточно направить
webhook обратно:

```bash
curl -fsS -X POST \
  -H "Authorization: Bearer $TELEGRAM_ADMIN_SECRET" \
  https://saletracker-digest.vercel.app/api/telegram/configuration
```
