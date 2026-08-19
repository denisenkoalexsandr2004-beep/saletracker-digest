import { randomUUID } from "node:crypto";

import { z } from "zod";

import { checkCandidateQuality } from "@/features/news-ingestion/candidate-quality";
import { getNewsCandidateRepository } from "@/features/news-ingestion/news-candidate.repository";
import type {
  NewsCandidate,
  NewsIngestionRun,
} from "@/features/news-ingestion/news-candidate.types";
import { NewsAgentError } from "@/features/news-ingestion/openai-news-agent";
import {
  fetchFeed,
  getFeedSources,
  selectFreshEntries,
  type FeedEntry,
} from "@/features/news-ingestion/rss-feed";
import { newsSourceRegistry } from "@/features/news-sources/news-source.registry";
import type { NewsSource } from "@/features/news-sources/news-source.types";
import { digestTags } from "@/features/subscriptions/subscription.categories";
import { env } from "@/shared/config/env";

// Порция публикаций на один вызов. Полный обход собирается из нескольких
// вызовов подряд, чтобы каждый уложился в лимит времени serverless-функции.
const ENTRIES_PER_BATCH = 25;
const ARTICLE_TEXT_LIMIT = 6_000;

const cardSchema = z.object({
  sourceUrl: z.url(),
  title: z.string().trim().min(8).max(180),
  summary: z.string().trim().min(30).max(700),
  marketImpact: z.string().trim().min(30).max(700),
  businessImpact: z.string().trim().min(20).max(500),
  keyMetrics: z
    .array(
      z.object({
        value: z.string().trim().min(1).max(50),
        label: z.string().trim().min(2).max(100),
        context: z.string().trim().min(4).max(220),
      }),
    )
    .min(1)
    .max(5),
  tags: z.array(z.string().trim().min(2).max(60)).min(1).max(8),
  confidence: z.number().min(0).max(1),
});

const cardsEnvelopeSchema = z.object({ cards: z.array(z.unknown()).max(20) });

export interface FeedIngestionInput {
  days: number;
  maxCandidates: number;
  sourceIds?: string[];
  /** Сколько свежих публикаций пропустить — номер порции разбора. */
  entryOffset?: number;
}

export interface FeedIngestionDiagnostics {
  feedCount: number;
  entriesFound: number;
  entriesReviewed: number;
  articlesRead: number;
  accepted: number;
  rejected: Array<{ sourceUrl: string; reasons: string[] }>;
}

function selectFeedSources(sourceIds?: string[]): NewsSource[] {
  const allowed = sourceIds?.length ? new Set(sourceIds) : null;
  return getFeedSources(newsSourceRegistry).filter(
    (source) => !allowed || allowed.has(source.id),
  );
}

/**
 * Достаёт читаемый текст публикации. Разметка выбрасывается целиком: модели
 * нужен фактический материал, а не навигация и скрипты.
 */
export async function fetchArticleText(
  url: string,
  timeoutMs = 12_000,
): Promise<string> {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; SaleTrackerDigestBot/1.0; +https://platforma-czs.ru/)",
        accept: "*/*",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      return "";
    }

    const buffer = await response.arrayBuffer();
    const charset =
      /charset=["']?([\w-]+)/i.exec(response.headers.get("content-type") ?? "")?.[1] ??
      "utf-8";
    let html: string;

    try {
      html = new TextDecoder(charset.toLowerCase()).decode(buffer);
    } catch {
      html = new TextDecoder("utf-8").decode(buffer);
    }

    return html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, ARTICLE_TEXT_LIMIT);
  } catch {
    return "";
  }
}

async function askModel(
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<string> {
  let response: Response;

  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const timedOut =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");
    throw new NewsAgentError(
      timedOut ? "OPENAI_TIMEOUT" : "OPENAI_UPSTREAM_ERROR",
      timedOut
        ? `Разбор публикаций не уложился в ${Math.round(timeoutMs / 1_000)} с.`
        : `Не удалось связаться с OpenAI: ${error instanceof Error ? error.message : "сетевая ошибка"}.`,
      timedOut ? 504 : 502,
    );
  }

  const payload = (await response.json()) as {
    output?: Array<{
      type?: string;
      content?: Array<{ type?: string; text?: string }>;
    }>;
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new NewsAgentError(
      "OPENAI_UPSTREAM_ERROR",
      payload.error?.message ?? "OpenAI не смог обработать публикации.",
      502,
    );
  }

  for (const output of payload.output ?? []) {
    if (output.type !== "message") {
      continue;
    }

    for (const content of output.content ?? []) {
      if (content.type === "output_text" && content.text) {
        return content.text;
      }
    }
  }

  throw new NewsAgentError(
    "INVALID_AGENT_RESPONSE",
    "Модель не вернула структурированный результат.",
    502,
  );
}

const cardsOutputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    cards: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          sourceUrl: { type: "string" },
          title: { type: "string" },
          summary: { type: "string" },
          marketImpact: { type: "string" },
          businessImpact: { type: "string" },
          keyMetrics: {
            type: "array",
            minItems: 1,
            maxItems: 5,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                value: { type: "string" },
                label: { type: "string" },
                context: { type: "string" },
              },
              required: ["value", "label", "context"],
            },
          },
          tags: { type: "array", minItems: 1, maxItems: 8, items: { type: "string" } },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        required: [
          "sourceUrl",
          "title",
          "summary",
          "marketImpact",
          "businessImpact",
          "keyMetrics",
          "tags",
          "confidence",
        ],
      },
    },
  },
  required: ["cards"],
} as const;

export function buildCardsRequest(
  articles: Array<FeedEntry & { text: string }>,
  maxCards: number,
) {
  return {
    model: env.OPENAI_NEWS_MODEL,
    reasoning: { effort: "low" },
    input: [
      {
        role: "system",
        content:
          "Вы — редактор отраслевой аналитики SaleTracker. Вам передают тексты публикаций, уже собранные из проверенных изданий. Ваша задача — отобрать те, что важны поставщикам и закупщикам розничных сетей, и оформить по ним карточки. Пишите по-русски, профессионально и без штампов. Используйте только факты из переданного текста: не додумывайте цифры, даты и названия. Каждая карточка обязана содержать минимум один числовой показатель, взятый из текста. Если в публикации нет ни одной проверяемой цифры или она не относится к рынку, просто не включайте её в ответ.",
      },
      {
        role: "user",
        content: [
          `Отберите до ${maxCards} самых значимых публикаций и оформите карточки.`,
          `Поле sourceUrl копируйте буквально из блока публикации, не изменяя.`,
          `Используйте только теги из каталога SaleTracker: ${digestTags.join(", ")}.`,
          "",
          ...articles.map(
            (article, index) =>
              `### Публикация ${index + 1}\nsourceUrl: ${article.url}\nИздание: ${article.sourceName}\nДата: ${article.publishedAt}\nЗаголовок: ${article.title}\nТекст: ${article.text || article.summary}`,
          ),
        ].join("\n"),
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "saletracker_feed_cards",
        strict: true,
        schema: cardsOutputSchema,
      },
    },
  };
}

export async function runFeedIngestion(input: FeedIngestionInput): Promise<{
  run: NewsIngestionRun;
  candidates: NewsCandidate[];
  diagnostics: FeedIngestionDiagnostics;
}> {
  if (!env.OPENAI_API_KEY) {
    throw new NewsAgentError(
      "OPENAI_NOT_CONFIGURED",
      "Добавьте OPENAI_API_KEY, чтобы разбирать публикации из лент.",
      503,
    );
  }

  const sources = selectFeedSources(input.sourceIds);

  if (!sources.length) {
    throw new NewsAgentError(
      "NO_ALLOWED_SOURCES",
      "Ни у одного выбранного источника нет ленты.",
      422,
    );
  }

  const startedAt = new Date().toISOString();
  const earliest = new Date(startedAt);
  earliest.setUTCDate(earliest.getUTCDate() - input.days);
  const earliestIso = earliest.toISOString();

  // Ленты читаются параллельно: недоступная не должна задерживать остальные.
  const feeds = await Promise.all(sources.map((source) => fetchFeed(source)));
  const entries = selectFreshEntries(feeds.flat(), earliestIso, startedAt);
  const offset = Math.max(0, input.entryOffset ?? 0);
  const reviewed = entries.slice(offset, offset + ENTRIES_PER_BATCH);

  if (!reviewed.length) {
    const emptyRun: NewsIngestionRun = {
      id: `ingestion_${randomUUID()}`,
      startedAt,
      completedAt: new Date().toISOString(),
      model: env.OPENAI_NEWS_MODEL,
      sourceCount: sources.length,
      candidateCount: 0,
    };
    await getNewsCandidateRepository().saveRun(emptyRun, []);
    return {
      run: emptyRun,
      candidates: [],
      diagnostics: {
        feedCount: sources.length,
        entriesFound: entries.length,
        entriesReviewed: 0,
        articlesRead: 0,
        accepted: 0,
        rejected: [],
      },
    };
  }

  const texts = await Promise.all(
    reviewed.map(async (entry) => ({
      ...entry,
      text: await fetchArticleText(entry.url),
    })),
  );
  const articlesRead = texts.filter((article) => article.text.length > 0).length;
  const outputText = await askModel(
    buildCardsRequest(texts, input.maxCandidates),
    env.NEWS_AGENT_TIMEOUT_MS,
  );

  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(outputText);
  } catch {
    throw new NewsAgentError(
      "INVALID_AGENT_RESPONSE",
      "Модель вернула некорректный JSON.",
      502,
    );
  }

  const envelope = cardsEnvelopeSchema.safeParse(parsedJson);

  if (!envelope.success) {
    throw new NewsAgentError(
      "INVALID_AGENT_RESPONSE",
      "Ответ модели не содержит списка карточек.",
      502,
    );
  }

  const knownEntries = new Map(texts.map((entry) => [entry.url, entry]));
  const collectedAt = new Date().toISOString();
  const rejected: Array<{ sourceUrl: string; reasons: string[] }> = [];
  const candidates: NewsCandidate[] = [];

  for (const raw of envelope.data.cards) {
    const parsed = cardSchema.safeParse(raw);

    if (!parsed.success) {
      rejected.push({
        sourceUrl:
          typeof (raw as { sourceUrl?: unknown })?.sourceUrl === "string"
            ? (raw as { sourceUrl: string }).sourceUrl
            : "—",
        reasons: parsed.error.issues
          .slice(0, 5)
          .map((issue) => `schema:${issue.path.join(".") || "?"}`),
      });
      continue;
    }

    const card = parsed.data;
    // Ссылка обязана совпадать с публикацией из ленты — так карточка не может
    // сослаться на выдуманный адрес.
    const entry = knownEntries.get(card.sourceUrl);

    if (!entry) {
      rejected.push({
        sourceUrl: card.sourceUrl,
        reasons: ["url-not-from-feed"],
      });
      continue;
    }

    const quality = checkCandidateQuality(
      {
        sourceUrl: card.sourceUrl,
        publishedAt: entry.publishedAt,
        tags: card.tags,
        keyMetrics: card.keyMetrics,
      },
      sources,
      earliestIso,
      collectedAt,
    );

    if (!quality.accepted) {
      rejected.push({ sourceUrl: card.sourceUrl, reasons: quality.reasons });
      continue;
    }

    candidates.push({
      id: `candidate_${randomUUID()}`,
      title: card.title,
      sourceName: quality.source?.name ?? entry.sourceName,
      sourceUrl: card.sourceUrl,
      publishedAt: entry.publishedAt,
      collectedAt,
      summary: card.summary,
      marketImpact: card.marketImpact,
      businessImpact: card.businessImpact,
      keyMetrics: card.keyMetrics,
      tags: card.tags,
      confidence: card.confidence,
      status: "collected",
      verificationStatus: "structural-pass",
      verificationReasons: quality.reasons,
    });
  }

  const accepted = candidates.slice(0, input.maxCandidates);
  const run: NewsIngestionRun = {
    id: `ingestion_${randomUUID()}`,
    startedAt,
    completedAt: new Date().toISOString(),
    model: env.OPENAI_NEWS_MODEL,
    sourceCount: sources.length,
    candidateCount: accepted.length,
  };

  await getNewsCandidateRepository().saveRun(run, accepted);

  return {
    run,
    candidates: accepted,
    diagnostics: {
      feedCount: sources.length,
      entriesFound: entries.length,
      entriesReviewed: reviewed.length,
      articlesRead,
      accepted: accepted.length,
      rejected,
    },
  };
}
