# SaleTracker Digest — production setup

## 1. Required services

- HTTPS hosting capable of running Next.js server routes. GitHub Pages alone is
  not sufficient.
- PostgreSQL 15+ (Supabase, Neon or another managed PostgreSQL provider).
- An HTTP scheduler. The repository includes a GitHub Actions scheduler; the
  hosting provider's cron service may be used instead.
- Telegram Bot API credentials and an OpenAI API key.

## 2. Environment

Set all values from `.env.example`. Production readiness requires:

```dotenv
APP_URL=https://your-domain.example
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
NEWS_INGESTION_MAX_AGE_MINUTES=150
NEWS_APPROVED_SOURCE_MAX_AGE_HOURS=48
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

The included `.github/workflows/scheduled-jobs.yml` requires two GitHub Actions
repository secrets:

```text
SALETRACKER_APP_URL=https://your-domain.example
SALETRACKER_CRON_SECRET=the-same-value-as-CRON_SECRET
```

It calls news ingestion hourly and retries digest dispatch every ten minutes
during the protected delivery window. Alternatively, configure another
scheduler to send an HTTP POST and the header
`Authorization: Bearer <CRON_SECRET>`:

- `/api/jobs/news-ingestion` — once per hour;
- `/api/jobs/digest-dispatch` — every ten minutes from 12:00 through 14:59
  Europe/Moscow (09:00–11:59 UTC).

The digest job itself applies daily, Monday/Thursday, weekly Monday and first
Monday-of-month rules. Calling the same slot again is safe and does not create
duplicate deliveries.

## 6. Readiness

- `/api/health` is a liveness check and always describes the current mode.
- `/api/ready` returns `200` only when PostgreSQL, dedicated admin auth, HTTPS,
  Telegram, scheduler and AI are configured and both the last ingestion and
  newest approved source are within their configured freshness limits.
  Otherwise it returns `503` and identifies the failed or stale check.

Before launch run:

```bash
npm test
npm run lint
npm run build
```
