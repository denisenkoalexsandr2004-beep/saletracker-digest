import { describe, expect, it } from "vitest";

import { NewsAgentError } from "@/features/news-ingestion/news-agent.error";
import {
  assertFeedBatchSucceeded,
  buildCardsAnalysisRequest,
} from "@/features/news-ingestion/rss-ingestion";

describe("RSS ingestion orchestration", () => {
  it("считает полностью упавшую AI-пачку ошибкой задания", () => {
    expect(() =>
      assertFeedBatchSucceeded(
        3,
        ["quota exceeded", "quota exceeded", "quota exceeded"],
        "OpenAI",
      ),
    ).toThrowError(
      expect.objectContaining({
        code: "NEWS_INGESTION_BATCH_FAILED",
        status: 502,
      }) as Partial<NewsAgentError>,
    );
  });

  it("разрешает частичный успех и пустую очередь", () => {
    expect(() =>
      assertFeedBatchSucceeded(3, ["one failed"], "Perplexity"),
    ).not.toThrow();
    expect(() => assertFeedBatchSucceeded(0, [], "Perplexity")).not.toThrow();
  });

  it("передаёт модели один URL и текст статьи", () => {
    const request = buildCardsAnalysisRequest(
      [
        {
          sourceId: "source-1",
          sourceName: "Издание",
          title: "Продажи категории выросли на 20%",
          url: "https://example.com/news/1",
          publishedAt: "2026-08-20T09:00:00+03:00",
          summary: "Краткое описание публикации.",
          text: "Продажи категории выросли на 20% год к году.",
        },
      ],
      1,
    );

    expect(request.schemaName).toBe("saletracker_feed_card");
    expect(request.userPrompt).toContain("https://example.com/news/1");
    expect(request.userPrompt).toContain("выросли на 20%");
  });
});
