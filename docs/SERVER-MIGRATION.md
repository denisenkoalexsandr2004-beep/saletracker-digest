# Перенос SaleTracker Digest на собственный сервер

Документ описывает переезд с Vercel на VPS с постоянным Node-процессом.

## Зачем

Serverless-платформа замораживает процесс сразу после ответа. Из-за этого:

- фоновый цикл Telegram-поллинга умирает, не начавшись;
- отправка многочастного выпуска упирается в лимит времени функции
  (на тарифе Hobby — 60 секунд, поднять нельзя);
- при таймауте функции апдейт Telegram уже помечен обработанным, повтор
  отбрасывается как дубль, и подписчик не получает выпуск;
- глобальное состояние (offset поллинга, пул соединений) не переживает
  переключение инстансов.

Постоянный процесс снимает все четыре ограничения.

## Два сценария

| | Зарубежный сервер | Российский сервер |
| --- | --- | --- |
| Приём Telegram | webhook | **long polling** |
| Исходящие запросы | напрямую | **через прокси** |
| Публичный HTTPS | обязателен | нужен только для сайта |

Российский сценарий сложнее ровно на одну вещь — прокси. Причина в том, что
ни Telegram, ни OpenAI с российских адресов не отвечают, а входящие вебхуки
Telegram до российского сервера не доходят.

Дальше описан российский сценарий (reg.ru); отличия зарубежного отмечены
отдельно.

## 1. Проверка сервера

До установки убедитесь, что сервер подходит:

```bash
free -m                      # нужно от 2 ГБ RAM, комфортно 4 ГБ
df -h /                      # нужно от 10 ГБ свободного места
ss -tlnp | grep -E ':(80|443|3000)'   # заняты ли порты
systemctl list-units --type=service --state=running | head -30
```

Если на сервере уже живут другие проекты, менять их конфигурацию нельзя —
приложение занимает только порт 3000 и отдельный виртуальный хост nginx.

При 1–2 ГБ памяти сборка Next.js может не поместиться. Тогда добавьте своп:

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

## 2. Проверка сети

Это решающий шаг: он показывает, нужен ли прокси вообще.

```bash
curl -s -o /dev/null -w '%{http_code}\n' --max-time 10 https://api.telegram.org
curl -s -o /dev/null -w '%{http_code}\n' --max-time 10 https://api.openai.com/v1/models
curl -s -o /dev/null -w '%{http_code}\n' --max-time 10 https://ep-purple-haze-axlzhuf9-pooler.c-4.us-east-2.aws.neon.tech
```

Ожидаемо для российского адреса: Telegram и OpenAI не отвечают или отдают
таймаут, база доступна. Если так — включаем прокси по разделу 5.

## 3. Подготовка

```bash
adduser --disabled-password --gecos "" saletracker
apt update && apt install -y nginx certbot python3-certbot-nginx git curl
timedatectl set-timezone UTC

curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt install -y nodejs

install -d -o saletracker -g saletracker /srv/saletracker
```

Node нужен версии **24**: флаг `--use-env-proxy`, на котором держится вся
схема с прокси, появился именно в нём.

От пользователя `saletracker`:

```bash
git clone https://github.com/denisenkoalexsandr2004-beep/saletracker-digest.git /srv/saletracker
cd /srv/saletracker
npm ci
```

## 4. База данных

Neon переносить не обязательно — он работает и на бесплатном тарифе, и
российские адреса он не блокирует. Проверьте доступность командой из раздела 2.

Если хочется убрать задержку до США, поднимите PostgreSQL прямо на сервере:

```bash
apt install -y postgresql
sudo -u postgres createuser saletracker --pwprompt
sudo -u postgres createdb saletracker --owner saletracker
```

Перенос данных:

```bash
pg_dump "$NEON_DATABASE_URL" --no-owner --no-privileges -Fc -f dump.pgc
pg_restore --no-owner --no-privileges -d "$LOCAL_DATABASE_URL" dump.pgc
```

Схему на чистой базе создают миграции: `npm run db:migrate`.

## 5. Переменные окружения

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
NEWS_AI_PROVIDER=openai
OPENAI_API_KEY=...
OPENAI_NEWS_MODEL=gpt-5.6-luna
PERPLEXITY_API_KEY=
PERPLEXITY_NEWS_MODEL=sonar
NEWS_INGESTION_MAX_AGE_MINUTES=150
NEWS_APPROVED_SOURCE_MAX_AGE_HOURS=48

# Только для российского сервера
HTTPS_PROXY=http://адрес-зарубежного-сервера:3128
HTTP_PROXY=http://адрес-зарубежного-сервера:3128
NO_PROXY=127.0.0.1,localhost,.neon.tech
```

`NO_PROXY` держит базу и локальные обращения в обход прокси — иначе весь
трафик к PostgreSQL пойдёт через другую страну.

Отдельно положите секрет планировщика для cron:

```bash
printf '%s' "$CRON_SECRET" > /srv/saletracker/.cron-secret
chmod 600 /srv/saletracker/.cron-secret
```

### Если прокси ещё нет

На зарубежном сервере достаточно любого HTTP-прокси. Пример с 3proxy:

```bash
apt install -y 3proxy
cat > /etc/3proxy/3proxy.cfg <<'CFG'
nserver 1.1.1.1
nscache 65536
timeouts 1 5 30 60 180 1800 15 60
auth iponly
allow * IP_РОССИЙСКОГО_СЕРВЕРА * *
proxy -p3128 -a
deny *
CFG
systemctl enable --now 3proxy
```

Доступ ограничен по IP российского сервера — пароль не нужен. Если прокси уже
поднят под другую задачу, убедитесь, что в белом списке доменов есть и
`api.telegram.org`, и `api.openai.com`.

## 6. Сервис, nginx и сертификат

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

Юнит запускает Node с `--use-env-proxy`. Без переменной `HTTPS_PROXY` флаг
ничего не делает, поэтому один и тот же файл годится для обоих сценариев.

## 7. Telegram

### Российский сервер — polling

Снимите webhook, иначе Telegram будет отдавать обновления только ему, а
`getUpdates` вернёт ошибку:

```bash
curl -fsS -X DELETE \
  -H "Authorization: Bearer $TELEGRAM_ADMIN_SECRET" \
  https://digest.example.ru/api/telegram/configuration
```

Приложение поднимает цикл long polling при старте процесса и само перейдёт в
рабочий режим в течение минуты. Проверка:

```bash
curl https://digest.example.ru/api/telegram/status
```

Поле `deliveryListener.mode` должно стать `polling`, а `running` — `true`.

### Зарубежный сервер — webhook

```bash
curl -fsS -X POST \
  -H "Authorization: Bearer $TELEGRAM_ADMIN_SECRET" \
  https://digest.example.ru/api/telegram/configuration
```

## 8. Планировщик

```bash
crontab -u saletracker deploy/crontab   # предварительно подставьте свой домен
```

После этого workflow `.github/workflows/scheduled-jobs.yml` можно отключить,
чтобы задания не запускались дважды.

Частоту сбора новостей есть смысл снизить с ежечасной до 4–6 раз в сутки —
свежие материалы не появляются каждый час, а каждый запуск тратит платные
токены OpenAI.

## 9. Проверка

```bash
curl https://digest.example.ru/api/health   # ожидается mode: persistent
curl https://digest.example.ru/api/ready    # ожидается status: ok
```

`/api/ready` отдаёт `200` только при полном контуре: база, отдельная защита
админки, HTTPS, Telegram, планировщик, AI и свежие данные. Пока сбор новостей
не отработал, проверка `newsFreshness` останется `stale` — это ожидаемо.

Живая проверка: создать подписку на сайте, нажать Start в боте, убедиться,
что пришли приветствие и выпуск.

## 10. Выкатка обновлений

```bash
/srv/saletracker/deploy/release.sh
```

Скрипт подтягивает `main`, применяет миграции, собирает проект, перезапускает
сервис и ждёт ответа `/api/health`.

## 11. Откат

Домен на Vercel остаётся рабочим. Чтобы вернуться, остановите сервис и верните
webhook на прежний адрес:

```bash
systemctl stop saletracker
curl -fsS -X POST \
  -H "Authorization: Bearer $TELEGRAM_ADMIN_SECRET" \
  https://saletracker-digest.vercel.app/api/telegram/configuration
```
