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

- `POST /api/jobs/news-ingestion` — hourly source discovery with mandatory live
  web search, a domain allowlist and a bounded publication window. The hour is
  an idempotency slot, so repeated calls do not duplicate a run.
- `POST /api/jobs/digest-dispatch` — every ten minutes between 12:00 and 14:59
  Europe/Moscow. The wider retry window protects against scheduler delay; the
  idempotency key still creates at most one delivery per subscriber/date.

Job and delivery state is persistent. A failed job may retry three times and
then moves to `dead-letter`; stale `running` jobs can be reclaimed after a
15-minute lease.

Telegram delivery also uses a 15-minute lease and persistent per-message
checkpoints. If a multipart digest fails midway, the retry resumes from the
first unsent message instead of duplicating the greeting and earlier parts.
Scheduled selection freezes approved materials at 11:30 Europe/Moscow. Every
candidate must also pass the source-publication freshness window for the
subscriber frequency (2 days for daily, 5 for twice-weekly, 10 for weekly and
35 for monthly). Recently approved old articles and future-dated articles are
excluded. The first issue is rebuilt after Telegram connection so a delayed
`/start` never releases a stale prebuilt digest.
