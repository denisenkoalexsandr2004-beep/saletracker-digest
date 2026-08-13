# SaleTracker Digest — production setup

## 1. Required services

- HTTPS hosting capable of running Next.js server routes. GitHub Pages alone is
  not sufficient.
- PostgreSQL 15+ (Supabase, Neon or another managed PostgreSQL provider).
- An HTTP scheduler such as Trigger.dev, Supabase Cron or the hosting provider's
  cron service.
- Telegram Bot API credentials and an OpenAI API key.

## 2. Environment

Set all values from `.env.example`. Production readiness requires:

```dotenv
NEXT_PUBLIC_APP_URL=https://your-domain.example
DATABASE_URL=postgresql://...
DB_POOL_SIZE=5
ADMIN_PASSWORD=use-a-long-unique-password
SESSION_SECRET=use-at-least-32-random-characters
CRON_SECRET=use-at-least-24-random-characters
TELEGRAM_BOT_USERNAME=...
TELEGRAM_BOT_TOKEN=...
TELEGRAM_WEBHOOK_SECRET=...
TELEGRAM_ADMIN_SECRET=...
OPENAI_API_KEY=...
OPENAI_NEWS_MODEL=gpt-5.6-sol
```

Never prefix private values with `NEXT_PUBLIC_`.

## 3. Database

Generate a migration only after intentional schema changes:

```bash
npm run db:generate
```

Apply committed migrations during deployment before starting the new version:

```bash
npm run db:migrate
```

The first migration is `drizzle/0000_powerful_overlord.sql`. The additive
`drizzle/0001_nifty_northstar.sql` adds persistent editorial materials and
their normalized tags. Together they create
persistent subscriptions, tags, Telegram identities and processed updates,
AI candidates and runs, digest deliveries/messages and background job runs.

## 4. Telegram webhook

Deploy the app at its final HTTPS URL, then call the existing protected
configuration endpoint once using `TELEGRAM_ADMIN_SECRET`. Verify
`/api/telegram/status` and Telegram's webhook information before opening the
public form.

## 5. Scheduler

Send an HTTP POST and the header
`Authorization: Bearer <CRON_SECRET>`:

- `/api/jobs/news-ingestion` — once per hour;
- `/api/jobs/digest-dispatch` — every day at 12:00 Europe/Moscow
  (09:00 UTC for a UTC-only scheduler).

The digest job itself applies daily, Monday/Thursday, weekly Monday and first
Monday-of-month rules. Calling the same slot again is safe.

## 6. Readiness

- `/api/health` is a liveness check and always describes the current mode.
- `/api/ready` returns `200` only when PostgreSQL and admin authentication are
  configured; otherwise it returns `503` with a failed check.

Before launch run:

```bash
npm test
npm run lint
npm run build
```
