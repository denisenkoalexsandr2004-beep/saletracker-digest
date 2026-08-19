import type { NewsSource } from "@/features/news-sources/news-source.types";

/**
 * Разбор RSS и Atom без внешних зависимостей.
 *
 * Веб-поиск возвращает выборку и отвечает неровно: один прогон приносит
 * несколько карточек, другой ни одной. Лента отдаёт все публикации за период
 * целиком, поэтому именно она даёт полноту, а модель применяется дальше —
 * к разбору отобранного текста.
 */
export interface FeedEntry {
  sourceId: string;
  sourceName: string;
  title: string;
  url: string;
  publishedAt: string;
  summary: string;
}

const entryPattern = /<(item|entry)[\s>][\s\S]*?<\/\1>/gi;

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function readTag(block: string, tag: string): string | null {
  const match = block.match(
    new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"),
  );
  return match ? decodeXml(match[1]) : null;
}

function readLink(block: string): string | null {
  const plain = readTag(block, "link");

  if (plain?.startsWith("http")) {
    return plain;
  }

  // Atom держит адрес в атрибуте, причём rel="alternate" может отсутствовать.
  const attribute = block.match(
    /<link[^>]*\shref=["']([^"']+)["'][^>]*>/i,
  );

  if (attribute?.[1]) {
    return attribute[1];
  }

  const guid = readTag(block, "guid");
  return guid?.startsWith("http") ? guid : null;
}

function readDate(block: string): string | null {
  for (const tag of ["pubDate", "published", "updated", "dc:date"]) {
    const raw = readTag(block, tag);
    const parsed = raw ? Date.parse(raw) : Number.NaN;

    if (Number.isFinite(parsed)) {
      return new Date(parsed).toISOString();
    }
  }

  return null;
}

export function parseFeed(xml: string, source: NewsSource): FeedEntry[] {
  const entries: FeedEntry[] = [];

  for (const [block] of xml.matchAll(entryPattern)) {
    const title = readTag(block, "title");
    const url = readLink(block);
    const publishedAt = readDate(block);

    if (!title || !url || !publishedAt) {
      continue;
    }

    entries.push({
      sourceId: source.id,
      sourceName: source.name,
      title,
      url,
      publishedAt,
      summary:
        readTag(block, "description") ??
        readTag(block, "summary") ??
        readTag(block, "content") ??
        "",
    });
  }

  return entries;
}

export function selectFreshEntries(
  entries: FeedEntry[],
  earliestPublishedAt: string,
  now: string,
): FeedEntry[] {
  const earliest = Date.parse(earliestPublishedAt);
  // Небольшой допуск вперёд: издания нередко ставят время публикации с запасом.
  const latest = Date.parse(now) + 6 * 60 * 60 * 1_000;
  const seen = new Set<string>();

  return entries
    .filter((entry) => {
      const published = Date.parse(entry.publishedAt);

      if (!Number.isFinite(published) || published < earliest || published > latest) {
        return false;
      }

      if (seen.has(entry.url)) {
        return false;
      }

      seen.add(entry.url);
      return true;
    })
    .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
}

/**
 * Часть лент отдаётся в windows-1251, поэтому текст декодируется по заявленной
 * кодировке, а не как UTF-8 — иначе кириллица превращается в мусор.
 */
async function readWithCharset(response: Response): Promise<string> {
  const buffer = await response.arrayBuffer();
  const declaredType = response.headers.get("content-type") ?? "";
  const fromHeader = /charset=["']?([\w-]+)/i.exec(declaredType)?.[1];
  const prologue = new TextDecoder("ascii").decode(buffer.slice(0, 256));
  const fromPrologue = /encoding=["']([\w-]+)["']/i.exec(prologue)?.[1];
  const charset = (fromHeader ?? fromPrologue ?? "utf-8").toLowerCase();

  try {
    return new TextDecoder(charset).decode(buffer);
  } catch {
    return new TextDecoder("utf-8").decode(buffer);
  }
}

export async function fetchFeed(
  source: NewsSource,
  timeoutMs = 15_000,
): Promise<FeedEntry[]> {
  if (!source.feedUrl) {
    return [];
  }

  try {
    const response = await fetch(source.feedUrl, {
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; SaleTrackerDigestBot/1.0; +https://platforma-czs.ru/)",
        // Перечисление конкретных типов приводит к 406 на части сайтов.
        accept: "*/*",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      return [];
    }

    return parseFeed(await readWithCharset(response), source);
  } catch {
    // Недоступная лента не должна прерывать сбор по остальным источникам.
    return [];
  }
}

export function getFeedSources(sources: NewsSource[]): NewsSource[] {
  return sources.filter((source) => source.enabledForAgent && source.feedUrl);
}
