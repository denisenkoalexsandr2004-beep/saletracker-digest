# Source Expansion Evaluation Contract

## Goal

Demonstrate that new sources increase useful category coverage without making ingestion unreliable, overwhelming the queue, or lowering editorial quality.

## Pilot unit

- Enable 3–5 verified RSS feeds in one wave.
- Run the normal hourly job for at least 48 hours.
- Do not change AI model, prompt, batch size, and source set simultaneously; otherwise the source effect cannot be isolated.

## Required measurements per source

- Feed fetch attempts and successful responses.
- Parsed entries, entries within the five-day freshness window, and new queue rows.
- Article fetch success and empty-text rate.
- Processed, accepted, rejected, retry, and dead-letter counts.
- Duplicate-content count.
- Accepted tags and number of previously weak categories covered.
- Median publication-to-queue and queue-to-review latency.

## Pass criteria for a source

- No repeated TLS, timeout, or parser failure across the pilot.
- At least one genuinely relevant, readable publication during the observation window, unless the source is intentionally low-frequency and primary.
- No systematic wrong-category tagging in manual review.
- No unacceptable amount of unrelated political, regional, event, or corporate-promotion noise.
- All accepted cards link to a concrete source item and preserve the source's actual date and claims.

## System-level pass criteria

- Pending queue depth returns toward baseline instead of growing monotonically.
- Existing high-value feeds continue to produce reviewed articles.
- At least one weak category gains fresh approved material.
- No increase in dead letters attributable to source expansion.
- Digest assembly still reaches target size with a meaningful personalized share for test subscriptions.

## Rollback trigger

Disable the specific feed, rather than the entire ingestion job, if it repeatedly fails, produces predominantly irrelevant entries, or causes disproportionate queue volume. Keep the source record and pilot evidence for later re-evaluation.

