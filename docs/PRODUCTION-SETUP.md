# SaleTracker Digest — production setup

## 1. Required services

- HTTPS hosting capable of running Next.js server routes. GitHub Pages alone is
  not sufficient.
- PostgreSQL 15+ (Supabase, Neon or another managed PostgreSQL provider).
- An HTTP scheduler. The repository includes a GitHub Actions scheduler; the
  hosting provider's cron service may be used instead.
- Telegram Bot API credentials and an API key for the selected news AI
  provider (OpenAI or Perplexity).

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
NEWS_AI_PROVIDER=openai
OPENAI_API_KEY=...
OPENAI_NEWS_MODEL=gpt-5.6-luna
PERPLEXITY_API_KEY=
PERPLEXITY_NEWS_MODEL=sonar
NEWS_INGESTION_MAX_AGE_MINUTES=150
NEWS_APPROVED_SOURCE_MAX_AGE_HOURS=48
NEWS_PROCESSING_BATCH_SIZE=8
NEWS_PROCESSING_CONCURRENCY=3
NEWS_PROCESSING_MAX_ATTEMPTS=3
NEWS_PROCESSING_RETRY_DELAY_MS=300000
NEWS_PROCESSING_LEASE_MINUTES=15
NEWS_DEAD_LETTER_RETRY_HOURS=6
NEWS_DEAD_LETTER_REQUEUE_BATCH_SIZE=24
NEWS_AUTO_APPROVE=true
NEWS_AUTO_APPROVE_MIN_CONFIDENCE=0.8
DIGEST_DISPATCH_BATCH_SIZE=6
```

Never prefix private values with `NEXT_PUBLIC_`.

To switch feed analysis to Perplexity, set
`NEWS_AI_PROVIDER=perplexity`, add `PERPLEXITY_API_KEY`, and leave
`PERPLEXITY_NEWS_MODEL=sonar` for the cost-efficient classifier. Only the key
matching `NEWS_AI_PROVIDER` is required. Restart or redeploy after changing the
provider. The legacy web-search mode remains OpenAI-only; scheduled and admin
RSS ingestion use the selected provider.

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
their normalized tags. `drizzle/0002_public_randall.sql` adds the durable,
deduplicated per-article news queue. `drizzle/0003_fixed_pretty_boy.sql` adds
the append-only AI token and cost log. Together they create
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

It calls news ingestion hourly and retries digest dispatch every five minutes
during the protected delivery window. Alternatively, configure another
scheduler to send an HTTP POST and the header
`Authorization: Bearer <CRON_SECRET>`:

- `/api/jobs/news-ingestion` — once per hour;
- `/api/jobs/digest-dispatch` — every five minutes from 12:00 through 14:59
  Europe/Moscow (09:00–11:59 UTC).

The digest job itself applies daily, Monday/Thursday, weekly Monday and first
Monday-of-month rules. Each call handles a bounded batch and the next tick
continues the durable queue. Calling the same slot again is safe and does not
create duplicate deliveries or Telegram messages.

Provider-related dead-letter articles are requeued after the configured
cooldown. With `NEWS_AUTO_APPROVE=true`, only candidates that passed the source,
freshness, tag and numeric-metric gates and meet the confidence threshold are
published automatically. Set it to `false` to restore mandatory editorial
approval.

## 6. Readiness

- `/api/health` is a liveness check and always describes the current mode.
- `/api/ready` returns `200` only when PostgreSQL, dedicated admin auth, HTTPS,
  Telegram, scheduler and AI are configured and both the last ingestion and
  newest approved source are within their configured freshness limits.
  It also reports queue totals, retries and dead-letter rows. Otherwise it
  returns `503` and identifies the failed or stale check.

Before launch run:

```bash
npm test
npm run lint
npm run build
```
