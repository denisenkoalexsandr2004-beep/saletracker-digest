# Research Map

| Question | Evidence location | Finding |
|---|---|---|
| What interests can a subscriber choose? | `src/features/subscriptions/subscription.categories.ts` | 70 exact tags spanning retail channels, food, non-food, and operations. |
| What sources already exist? | `src/features/news-sources/news-source.registry.ts` | 42 entries: 11 RSS, 29 web-search, 2 manual. |
| What does the production cron collect? | `src/app/api/jobs/news-ingestion/route.ts` | Only the RSS ingestion pipeline runs autonomously. |
| How are feeds parsed? | `src/features/news-ingestion/rss-feed.ts` | RSS/Atom items need title, URL, and a parsable date; charset fallback includes Windows-1251. |
| How are articles queued and reviewed? | `src/features/news-ingestion/rss-ingestion.ts`; `src/features/news-ingestion/news-article-queue.repository.ts` | Shared queue, bounded batch, configurable concurrency and retries, newest publication favored. |
| How are tags assigned? | `src/features/news-ingestion/rss-ingestion.ts` | One article at a time is analyzed against the full 70-tag catalog. |
| Where does personalization happen? | `src/features/digests/digest.service.ts` | At digest assembly, after editorial approval; approximately 80% personalized and 20% broad-market target. |
| Which new sources are credible and technically usable? | `docs/FMCG-SOURCE-RESEARCH.md` | Separated into confirmed RSS, web-search-only, limited/pilot, and rejected candidates. |

## Main uncertainties to measure in a pilot

- Accepted-card yield per feed under the mandatory-numeric-metric rule.
- Daily entry volume and queue growth after each enablement wave.
- Distribution of accepted cards across all 70 tags, especially niche non-food tags.
- Article fetch success for sites that use bot protection, redirects, legacy HTTP links, or malformed MIME types.
- Duplicate rate between new sources and the existing 11 RSS feeds.

