import { describe, expect, it } from "vitest";

import { checkCandidateQuality } from "@/features/news-ingestion/candidate-quality";
import { newsSourceRegistry } from "@/features/news-sources/news-source.registry";

const validCandidate = {
  sourceUrl: "https://www.retail.ru/news/novaya-programma-13-avgusta-2026/",
  publishedAt: "2026-08-13T08:00:00.000Z",
  tags: ["Ритейл", "СТМ"],
  keyMetrics: [
    { value: "15%", label: "рост", context: "Показатель из публикации" },
  ],
};

describe("candidate quality gate", () => {
  it("принимает структурно проверяемую карточку", () => {
    const result = checkCandidateQuality(
      validCandidate,
      newsSourceRegistry,
      "2026-08-12T00:00:00.000Z",
      "2026-08-13T09:00:00.000Z",
    );

    expect(result.accepted).toBe(true);
    expect(result.source?.id).toBe("retail-ru");
  });

  it("отклоняет главную страницу, неизвестный тег и показатель без числа", () => {
    const result = checkCandidateQuality(
      {
        ...validCandidate,
        sourceUrl: "https://www.retail.ru/",
        tags: ["Выдуманная категория"],
        keyMetrics: [
          { value: "рост", label: "динамика", context: "Нет числа" },
        ],
      },
      newsSourceRegistry,
      "2026-08-12T00:00:00.000Z",
      "2026-08-13T09:00:00.000Z",
    );

    expect(result.accepted).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        "not-a-direct-article-url",
        "unknown-tag",
        "metric-without-number",
      ]),
    );
  });

  it("отклоняет публикацию вне запрошенного периода", () => {
    const result = checkCandidateQuality(
      { ...validCandidate, publishedAt: "2026-07-01T08:00:00.000Z" },
      newsSourceRegistry,
      "2026-08-12T00:00:00.000Z",
      "2026-08-13T09:00:00.000Z",
    );

    expect(result.reasons).toContain("published-at-outside-window");
  });
});
