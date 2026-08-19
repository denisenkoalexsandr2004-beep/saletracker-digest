import { describe, expect, it } from "vitest";

import { parseFeed, selectFreshEntries } from "@/features/news-ingestion/rss-feed";
import type { NewsSource } from "@/features/news-sources/news-source.types";

const source = {
  id: "retail-ru",
  name: "Retail.ru",
  homepageUrl: "https://www.retail.ru/",
  searchDomain: "retail.ru",
  kind: "industry-media",
  collectionMode: "rss",
  priority: 1,
  topics: [],
  note: "",
  enabledForAgent: true,
  feedUrl: "https://www.retail.ru/rss/news",
} satisfies NewsSource;

describe("разбор лент", () => {
  it("читает RSS вместе с CDATA и датой публикации", () => {
    const entries = parseFeed(
      `<rss><channel>
        <item>
          <title><![CDATA[Импорт молочной продукции вырос на 10%]]></title>
          <link>https://www.retail.ru/news/import-1/</link>
          <pubDate>Tue, 19 Aug 2026 14:15:54 +0300</pubDate>
          <description><![CDATA[<p>За полугодие ввезено 406 млн литров.</p>]]></description>
        </item>
      </channel></rss>`,
      source,
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].title).toBe("Импорт молочной продукции вырос на 10%");
    expect(entries[0].url).toBe("https://www.retail.ru/news/import-1/");
    expect(entries[0].publishedAt).toBe("2026-08-19T11:15:54.000Z");
    expect(entries[0].summary).toBe("За полугодие ввезено 406 млн литров.");
  });

  it("читает Atom, где адрес лежит в атрибуте", () => {
    const entries = parseFeed(
      `<feed>
        <entry>
          <title>Доля российских яблок достигла 90%</title>
          <link rel="alternate" href="https://www.retail.ru/news/apples/"/>
          <published>2026-08-18T09:00:00Z</published>
          <summary>Сеть нарастила локальную долю.</summary>
        </entry>
      </feed>`,
      source,
    );

    expect(entries[0].url).toBe("https://www.retail.ru/news/apples/");
    expect(entries[0].publishedAt).toBe("2026-08-18T09:00:00.000Z");
  });

  it("пропускает записи без обязательных полей", () => {
    const entries = parseFeed(
      `<rss><channel>
        <item><title>Без ссылки и даты</title></item>
        <item><link>https://www.retail.ru/news/ok/</link><title>Есть всё</title><pubDate>Tue, 19 Aug 2026 10:00:00 +0300</pubDate></item>
      </channel></rss>`,
      source,
    );

    expect(entries.map((entry) => entry.title)).toEqual(["Есть всё"]);
  });

  it("оставляет свежие записи, убирает повторы и сортирует по дате", () => {
    const base = {
      sourceId: source.id,
      sourceName: source.name,
      summary: "",
      title: "Материал",
    };
    const fresh = selectFreshEntries(
      [
        { ...base, url: "https://a.ru/1", publishedAt: "2026-08-18T10:00:00.000Z" },
        { ...base, url: "https://a.ru/1", publishedAt: "2026-08-18T10:00:00.000Z" },
        { ...base, url: "https://a.ru/2", publishedAt: "2026-08-19T10:00:00.000Z" },
        { ...base, url: "https://a.ru/3", publishedAt: "2026-07-01T10:00:00.000Z" },
      ],
      "2026-08-15T00:00:00.000Z",
      "2026-08-19T12:00:00.000Z",
    );

    expect(fresh.map((entry) => entry.url)).toEqual([
      "https://a.ru/2",
      "https://a.ru/1",
    ]);
  });
});
