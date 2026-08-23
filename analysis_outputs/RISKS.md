# Source Expansion Risks

## High

- **Registry/runtime mismatch.** Web-search entries are not consumed by the autonomous hourly job. Listing them as enabled can look like coverage even when no articles are ingested.
- **Queue saturation.** The default reviewer capacity is 8 articles per hourly run. A broad RSS expansion can create a persistent backlog and newer-first processing can leave older entries untouched.
- **Silent feed failure.** `fetchFeed` returns an empty array on HTTP, TLS, timeout, charset, or parsing failure. Without per-source health metrics, a broken source is indistinguishable from a quiet news day.
- **Category imbalance.** High-volume general feeds can consume processing capacity before low-volume niche categories reach review, weakening personalization for rare interests.

## Medium

- **No source-to-tag contract.** Registry `topics` describe a source but do not constrain model tags or route collection by subscriber interest.
- **Numeric-metric requirement.** The AI prompt rejects articles without a numeric indicator. Regulators and associations can be authoritative yet produce a low accepted-card yield.
- **Source bias.** Company and association releases are primary for their own actions and positions, not independent estimates of the whole market.
- **Duplicate stories.** The same announcement can arrive from a regulator, association, media outlet, and company. Content hashing helps after article retrieval but still consumes discovery and fetch capacity.
- **Broad-feed noise.** Customs, alcohol-control, transport, marketing, and technology feeds need strict relevance filtering to prevent unrelated public-sector or event news from entering the queue.
- **TLS and anti-bot instability.** Some otherwise relevant sites use invalid certificates, intermittent 403 responses, or restrictive bot policies.

## Low but operationally important

- **Incorrect MIME types.** Some valid feeds return `text/html`; the current parser can still work if the body is RSS, but monitoring must validate content rather than only headers.
- **Empty advertised feeds.** A site may advertise RSS while returning a valid but zero-item channel. Such a feed should be classified as web-search-only, not RSS-ready.
- **Stale timestamps.** Entries without a parsable `pubDate`, `published`, `updated`, or `dc:date` are silently skipped by the parser.
- **Copyright and paywalls.** The service should retain links and concise derived summaries, avoid reproducing full articles, and treat inaccessible paid pages only as discovery signals.

