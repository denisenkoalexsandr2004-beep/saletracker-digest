# Conservative Change Map

This document identifies likely change points only. No implementation was authorized or performed during the research task.

| Potential change | Primary file(s) | Dependency/impact |
|---|---|---|
| Add verified sources | `src/features/news-sources/news-source.registry.ts` | Immediately affects autonomous collection only when `collectionMode: "rss"` and a working `feedUrl` are present. |
| Add source-specific relevance controls | Source types, RSS ingestion, candidate quality | Needed for broad official feeds; may require include/exclude terms or expected tags rather than prompt-only filtering. |
| Schedule web-search-only discovery | Job route and `openai-news-agent.ts` | Would make web-search registry entries operational; increases API cost and needs idempotency/rotation design. |
| Add per-source feed health | Ingestion diagnostics, persistence, admin UI | Distinguishes quiet feeds from HTTP/TLS/parser failures. |
| Prevent niche-source starvation | Queue claim policy or per-source quotas | Protects low-volume categories when broad feeds dominate intake. |
| Tune processing capacity | `.env` deployment values | Must be based on observed queue depth and provider rate limits, not source count alone. |
| Evaluate tag coverage | Admin analytics/reporting | Required to know whether every selectable interest can actually receive fresh material. |

## Recommended sequence

1. Registry-only pilot with a small set of verified RSS feeds.
2. Observe for 48 hours using the evaluation contract.
3. Add per-source observability before a second large wave.
4. Decide separately whether web-search-only sources justify a scheduled collector.
5. Expand capacity only after measuring queue arrival and processing rates.

