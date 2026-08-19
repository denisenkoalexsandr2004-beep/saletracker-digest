import { describe, expect, it } from "vitest";

import {
  buildNewsAgentRequest,
  extractWebSearchSourceUrls,
  selectRotatedSources,
  wasSourceConsulted,
} from "@/features/news-ingestion/openai-news-agent";
import { newsSourceRegistry } from "@/features/news-sources/news-source.registry";

describe("OpenAI news agent source evidence", () => {
  it("requires live web search and carries an exact freshness window", () => {
    const request = buildNewsAgentRequest(
      { days: 2, maxCandidates: 8 },
      newsSourceRegistry.slice(0, 2),
      "2026-08-14T09:00:00.000Z",
    );

    expect(request.dateFrom).toBe("2026-08-12T09:00:00.000Z");
    expect(request.body.tool_choice).toBe("required");
    expect(request.body.tools[0]).toMatchObject({
      type: "web_search",
      search_context_size: "high",
      external_web_access: true,
    });
    expect(request.body.input[1].content).toContain(
      "2026-08-12T09:00:00.000Z",
    );
  });

  it("uses only Structured Outputs keywords supported by the Responses API", () => {
    const request = buildNewsAgentRequest(
      { days: 2, maxCandidates: 8 },
      newsSourceRegistry.slice(0, 2),
      "2026-08-14T09:00:00.000Z",
    );
    const candidateSchema =
      request.body.text.format.schema.properties.candidates.items;

    expect(candidateSchema.properties.sourceUrl).toEqual({ type: "string" });
  });

  it("keeps one run inside the domain budget and rotates across slots", () => {
    const sources = newsSourceRegistry.filter((source) => source.enabledForAgent);
    const first = selectRotatedSources(sources, 0);
    const second = selectRotatedSources(sources, 1);

    expect(sources.length).toBeGreaterThan(10);
    expect(first.length).toBeLessThanOrEqual(10);
    expect(first.map((source) => source.id)).not.toEqual(
      second.map((source) => source.id),
    );
    // Слот повторяется по кругу, а группы вместе покрывают весь реестр.
    const groups = Math.ceil(sources.length / 10);
    const covered = new Set(
      Array.from({ length: groups }, (_, slot) =>
        selectRotatedSources(sources, slot),
      )
        .flat()
        .map((source) => source.id),
    );
    expect(covered.size).toBe(sources.length);
    expect(selectRotatedSources(sources, groups).map((s) => s.id)).toEqual(
      first.map((s) => s.id),
    );
  });

  it("extracts all consulted and cited URLs from a Responses API result", () => {
    const urls = extractWebSearchSourceUrls({
      output: [
        {
          type: "web_search_call",
          action: {
            sources: [
              { url: "https://retail.ru/news/first-story/" },
              { url: "https://tass.ru/ekonomika/12345" },
            ],
          },
        },
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: "{}",
              annotations: [
                {
                  type: "url_citation",
                  url: "https://www.retail.ru/news/first-story/?utm_source=test",
                },
              ],
            },
          ],
        },
      ],
    });

    expect(urls).toEqual([
      "https://retail.ru/news/first-story/",
      "https://tass.ru/ekonomika/12345",
      "https://www.retail.ru/news/first-story/?utm_source=test",
    ]);
  });

  it("matches the same article despite www, tracking parameters, and trailing slash", () => {
    expect(
      wasSourceConsulted("https://www.retail.ru/news/first-story/", [
        "https://retail.ru/news/first-story?utm_source=search",
      ]),
    ).toBe(true);
  });

  it("rejects a plausible URL that was not returned by web search", () => {
    expect(
      wasSourceConsulted("https://retail.ru/news/invented-story/", [
        "https://retail.ru/news/real-story/",
      ]),
    ).toBe(false);
  });

  it("does not confuse different query-addressed articles on the same path", () => {
    expect(
      wasSourceConsulted("https://example.ru/article?id=123", [
        "https://example.ru/article?id=456",
      ]),
    ).toBe(false);
  });
});
