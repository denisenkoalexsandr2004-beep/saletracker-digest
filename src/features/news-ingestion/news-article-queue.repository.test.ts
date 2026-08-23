import { describe, expect, it } from "vitest";

import {
  canonicalizeArticleUrl,
  InMemoryNewsArticleQueueRepository,
} from "@/features/news-ingestion/news-article-queue.repository";
import type { FeedEntry } from "@/features/news-ingestion/rss-feed";

const now = "2026-08-21T09:00:00.000Z";

function entry(url: string, title = "Важная новость рынка"): FeedEntry {
  return {
    sourceId: "retail",
    sourceName: "Retail Media",
    title,
    url,
    publishedAt: "2026-08-21T08:00:00.000Z",
    summary: "Рынок вырос на 12 процентов по итогам первого полугодия.",
  };
}

describe("news article queue", () => {
  it("deduplicates tracking variants by canonical URL", async () => {
    const repository = new InMemoryNewsArticleQueueRepository();
    const first = "https://www.example.com/news/42?utm_source=mail&region=ru";
    const second = "https://example.com/news/42?region=ru&fbclid=tracking";

    expect(canonicalizeArticleUrl(first)).toBe(
      canonicalizeArticleUrl(second),
    );
    await expect(
      repository.enqueue([entry(first), entry(second)], now),
    ).resolves.toEqual({ discovered: 2, created: 1, alreadyKnown: 1 });
  });

  it("retries only after the delay and dead-letters an exhausted article", async () => {
    const repository = new InMemoryNewsArticleQueueRepository();
    await repository.enqueue([entry("https://example.com/news/retry")], now);
    const claimOptions = {
      limit: 1,
      maxAttempts: 3,
      leaseMs: 15 * 60_000,
    };

    const [first] = await repository.claim({ ...claimOptions, now });
    expect(first.attemptCount).toBe(1);
    await repository.markFailed(first.id, {
      error: "OPENAI_TIMEOUT",
      maxAttempts: 3,
      retryDelayMs: 5 * 60_000,
      now,
    });
    await expect(
      repository.claim({
        ...claimOptions,
        now: "2026-08-21T09:04:59.000Z",
      }),
    ).resolves.toHaveLength(0);

    const [second] = await repository.claim({
      ...claimOptions,
      now: "2026-08-21T09:05:00.000Z",
    });
    await repository.markFailed(second.id, {
      error: "OPENAI_TIMEOUT",
      maxAttempts: 3,
      retryDelayMs: 5 * 60_000,
      now: "2026-08-21T09:05:00.000Z",
    });
    const [third] = await repository.claim({
      ...claimOptions,
      now: "2026-08-21T09:15:00.000Z",
    });
    const status = await repository.markFailed(third.id, {
      error: "OPENAI_TIMEOUT",
      maxAttempts: 3,
      retryDelayMs: 5 * 60_000,
      now: "2026-08-21T09:15:00.000Z",
    });

    expect(status).toBe("dead-letter");
    await expect(repository.getStats()).resolves.toMatchObject({
      retry: 0,
      deadLetter: 1,
    });

    await expect(
      repository.requeueRecoverableDeadLetters({
        limit: 10,
        retryBefore: "2026-08-21T09:15:00.000Z",
        now: "2026-08-21T15:15:00.000Z",
      }),
    ).resolves.toBe(1);
    const [recovered] = await repository.claim({
      ...claimOptions,
      now: "2026-08-21T15:15:00.000Z",
    });
    expect(recovered).toMatchObject({ status: "processing", attemptCount: 1 });
  });

  it("rejects the second article when different URLs contain the same text", async () => {
    const repository = new InMemoryNewsArticleQueueRepository();
    await repository.enqueue(
      [
        entry("https://example.com/news/original"),
        entry("https://another.example/news/copy", "Копия важной новости"),
      ],
      now,
    );
    const claimed = await repository.claim({
      limit: 2,
      maxAttempts: 3,
      leaseMs: 15 * 60_000,
      now,
    });
    const articleText =
      "Компания увеличила продажи на 12 процентов и открыла 25 магазинов.";

    await expect(
      repository.storeArticleText(claimed[0].id, articleText, now),
    ).resolves.toEqual({});
    await expect(
      repository.storeArticleText(claimed[1].id, articleText, now),
    ).resolves.toEqual({ duplicateOf: claimed[0].id });
    await expect(repository.getStats()).resolves.toMatchObject({
      processing: 1,
      rejected: 1,
    });
  });

  it("не возвращает в очередь постоянную ошибку содержимого", async () => {
    const repository = new InMemoryNewsArticleQueueRepository();
    await repository.enqueue(
      [entry("https://example.com/news/unreadable")],
      now,
    );
    const [article] = await repository.claim({
      limit: 1,
      maxAttempts: 1,
      leaseMs: 15 * 60_000,
      now,
    });
    await repository.markFailed(article.id, {
      error: "ARTICLE_TEXT_UNAVAILABLE",
      maxAttempts: 1,
      retryDelayMs: 5 * 60_000,
      now,
    });

    await expect(
      repository.requeueRecoverableDeadLetters({
        limit: 10,
        retryBefore: now,
        now: "2026-08-21T15:00:00.000Z",
      }),
    ).resolves.toBe(0);
  });
});
