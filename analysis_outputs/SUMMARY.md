# Project Analysis Summary

## Scope

- The repository is a Next.js news-digest service, not a deep-learning research repository. The `analyze-project` workflow was therefore applied as a read-only architecture and data-pipeline audit; its DL-specific analyzer was not run.
- The research scope is Russian-language and Russia/EAEU-relevant sources because that is the scope of the existing source registry and product copy.
- No application code, production configuration, source registry, database, or external account was changed by this audit.

## Current coverage

- The subscription form exposes 70 exact interest tags in `src/features/subscriptions/subscription.categories.ts`.
- The registry contains 42 sources: 11 RSS, 29 web-search, and 2 manual Telegram radars.
- Existing direct coverage is strongest for general retail, e-commerce, dairy, meat, fish, agrifood, packaging, and logistics.
- The largest direct gaps are bakery and confectionery, drinks, ready food, healthy/plant-based/organic products, and specialized non-food: beauty, household chemicals, fashion, children, pets, DIY, furniture, flowers, stationery, sports, automotive, jewelry, and pharmacy retail.

## Important runtime finding

- The autonomous hourly job in `src/app/api/jobs/news-ingestion/route.ts` calls `runFeedIngestion`, not the web-search agent.
- `runFeedIngestion` selects only enabled registry entries that have a `feedUrl`. Consequently, adding a `web-search` source to the registry does **not** make the hourly collector ingest it.
- Every RSS source is collected into a shared article pool. The model then assigns tags from the complete 70-tag catalog.
- Subscriber interests are applied later in `src/features/digests/digest.service.ts`: the target is approximately 80% tag-matched material and 20% broad market material. Sources are therefore not fetched separately per subscriber.
- This shared-pool architecture is appropriate for 30–100 subscribers, but breadth must be created at ingestion time and personalization quality depends on accurate article tagging.

## Capacity implications

- The current default processing batch is 8 articles per hourly run, or a theoretical maximum of 192 article reviews per day when the cron executes every hour.
- New RSS feeds increase discovery volume but do not automatically increase review capacity. They should be enabled in waves while queue depth, rejection rate, per-source yield, and duplicates are measured.
- Queue claiming prioritizes newer publications. A permanently oversized intake can starve older pending entries, so a large one-shot registry expansion is unsafe without monitoring.

## Conservative recommendations

1. First add only verified, fresh RSS feeds that fill a documented category gap. Do not enable every discovered feed at once.
2. Pilot the first wave for 48 hours and record, per source: fetched entries, readable articles, AI-accepted cards, duplicates, failures, and category distribution.
3. Treat official and association sources as primary evidence, but expect lower card yield because many notices lack the numeric metric required by the current prompt.
4. Keep web-search-only sources in a separate backlog until a scheduled web-search/discovery path is explicitly implemented or restored; otherwise their registry presence creates false confidence.
5. Preserve source-specific trust labels: corporate and association claims must not be phrased as independent market estimates.

## Additional documents

- `docs/FMCG-SOURCE-RESEARCH.md`
- `analysis_outputs/RESEARCH_MAP.md`
- `analysis_outputs/CHANGE_MAP.md`
- `analysis_outputs/EVAL_CONTRACT.md`
- `analysis_outputs/RISKS.md`

