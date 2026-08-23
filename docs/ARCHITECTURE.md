# SaleTracker Digest — architecture

## First release

The first release is a feature-first Next.js monolith. It demonstrates the
complete product path without requiring production secrets:

1. A visitor selects a role, tags, frequency and digest size.
2. The subscription API validates the request and creates a demo connection
   token.
3. The digest service selects approved notes using the 80/20 rule.
4. The issue is rendered as a Telegram preview.
5. A relevant CZS event is selected and attached to the final message.
6. The admin demo shows the editorial queue, issues, events and attributed
   leads.

## Decisions

- **Structure:** feature-first. Subscription, digest, editorial and event
  behavior stay inside their domains.
- **Boundary:** typed REST endpoints with shared Zod schemas. SaleTracker can
  consume the same contract later.
- **Persistence:** repositories select PostgreSQL/Drizzle when `DATABASE_URL`
  is configured and use the in-memory adapter only for explicit local demos.
- **Authentication:** `/admin` and every `/api/admin/*` operation require a
  signed, same-domain, httpOnly administrator session.
- **Jobs:** digest generation and delivery are designed as idempotent jobs.
- **Integrations:** Telegram, AI and storage are adapters configured only
  through environment variables.
- **AI provider:** RSS classification uses one provider-neutral structured
  output boundary. `NEWS_AI_PROVIDER` selects OpenAI Responses or Perplexity
  Sonar; queue, validation and editorial code do not depend on either API.
- **AI metering:** every successful provider response creates an immutable
  `news_ai_usage_events` row. Token categories, retries, model-filtered rows,
  provider-reported Perplexity cost and calculated OpenAI token/tool cost stay
  auditable independently from accepted candidates.

## Telegram flow

```text
Subscription form
  → pending subscription + random connection token
  → t.me/<bot>?start=<token>
  → Telegram webhook or local polling
  → token bound to private chat ID
  → confirmation + first digest
  → /digest and /settings commands
```

The webhook validates `X-Telegram-Bot-Api-Secret-Token`. Bot and administration
secrets are server-only environment variables. Telegram updates are deduplicated
by `update_id`; digest messages are sent sequentially and stay below the
4096-character Bot API limit. A serialized 25-second long-polling loop handles
the local pilot without requiring the browser page to remain open. It begins
immediately, retries temporary Telegram/network failures and does not wait for
a fixed browser-driven polling interval. Public deployments use the webhook.

## Feature map

```text
src/
  app/                 Routes and HTTP boundaries
  features/
    subscriptions/     Free pilot preferences and Telegram connection
    digests/           80/20 selection and Telegram rendering
    events/            CZS matching and lead CTA
    admin/             Editorial operations dashboard
  shared/              Demo data, configuration and shared UI
```

## Production boundaries

No secret is committed to the repository. Before production launch:

- apply the generated PostgreSQL migration and configure backups;
- configure Telegram webhook and the external production scheduler;
- add claim-level source evidence and green/yellow/red automatic verification;
- add click and lead attribution persistence;
- validate legal copy and consent storage.

## Autonomous jobs

The production scheduler calls two protected endpoints with
`Authorization: Bearer <CRON_SECRET>`:

- `POST /api/jobs/news-ingestion` — hourly RSS discovery followed by a bounded
  drain of the durable `news_articles` queue. Canonical URL and content hashes
  deduplicate work. Articles are claimed with row locks and leases, enriched
  independently with bounded concurrency, and retried independently. The hour
  remains an idempotency slot while unfinished rows stay available to later
  slots.
- `POST /api/jobs/digest-dispatch` — every five minutes between 12:00 and 14:59
  Europe/Moscow. Each invocation processes a bounded batch; per-slot job keys
  allow later ticks to continue while per-subscriber/date issue keys still
  prevent duplicate deliveries.

Job and delivery state is persistent. A failed job may retry three times and
then moves to `dead-letter`; stale `running` jobs can be reclaimed after a
15-minute lease.

News articles use the same reliability pattern at finer granularity. One bad
page or provider timeout moves only that article to `retry`; three failed
attempts move it to `dead-letter`. Provider and legacy OpenAI failures are
requeued after a cooldown with a fresh attempt budget; permanent content
errors, accepted items and rejected items remain terminal. If every claimed
article fails, the HTTP job itself returns an error and no successful ingestion
run is recorded, so monitoring cannot confuse a provider outage with an empty
news day.

In autonomous mode, candidates are approved only after the registry,
freshness, tag, numeric-metric and confidence gates pass. The same pipeline can
be switched back to mandatory editorial approval with `NEWS_AUTO_APPROVE=false`.

Telegram delivery also uses a 15-minute lease and persistent per-message
checkpoints. If a multipart digest fails midway, the retry resumes from the
first unsent message instead of duplicating the greeting and earlier parts.
Scheduled selection freezes approved materials at 11:30 Europe/Moscow. Every
candidate must also pass the source-publication freshness window for the
subscriber frequency (2 days for daily, 5 for twice-weekly, 10 for weekly and
35 for monthly). Recently approved old articles and future-dated articles are
excluded. The first issue is rebuilt after Telegram connection so a delayed
`/start` never releases a stale prebuilt digest.
