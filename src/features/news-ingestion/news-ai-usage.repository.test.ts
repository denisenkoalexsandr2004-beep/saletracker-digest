import { describe, expect, it } from "vitest";

import { InMemoryNewsAiUsageRepository } from "@/features/news-ingestion/news-ai-usage.repository";

describe("news AI usage repository", () => {
  it("агрегирует 24 часа и всё время, не удваивая request id", async () => {
    const repository = new InMemoryNewsAiUsageRepository();
    const current = {
      provider: "openai" as const,
      model: "gpt-5.6-luna",
      providerRequestId: "resp_current",
      operation: "feed-analysis" as const,
      inputTokens: 1_000,
      cachedInputTokens: 100,
      cacheWriteTokens: 0,
      outputTokens: 200,
      reasoningTokens: 50,
      totalTokens: 1_200,
      costUsdMicros: 400,
      costSource: "calculated" as const,
      createdAt: "2026-08-21T10:00:00.000Z",
    };

    await repository.record(current);
    await repository.record(current);
    await repository.record({
      ...current,
      providerRequestId: "resp_old",
      createdAt: "2026-08-19T10:00:00.000Z",
      costUsdMicros: undefined,
      costSource: "unknown",
    });

    const summary = await repository.getSummary("2026-08-21T12:00:00.000Z");

    expect(summary.last24Hours).toMatchObject({
      requestCount: 1,
      pricedRequestCount: 1,
      unpricedRequestCount: 0,
      totalTokens: 1_200,
      costUsdMicros: 400,
    });
    expect(summary.allTime).toMatchObject({
      requestCount: 2,
      pricedRequestCount: 1,
      unpricedRequestCount: 1,
      totalTokens: 2_400,
      costUsdMicros: 400,
    });
  });
});
