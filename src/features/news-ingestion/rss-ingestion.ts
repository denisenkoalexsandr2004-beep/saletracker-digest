import { randomUUID } from "node:crypto";

import { z } from "zod";

import { checkCandidateQuality } from "@/features/news-ingestion/candidate-quality";
import {
  getNewsArticleQueueRepository,
  type NewsArticleQueueStats,
  type QueuedNewsArticle,
} from "@/features/news-ingestion/news-article-queue.repository";
import {
  autoApproveNewsCandidates,
  type NewsAutoApprovalResult,
} from "@/features/news-ingestion/news-auto-approval.service";
import { getNewsCandidateRepository } from "@/features/news-ingestion/news-candidate.repository";
import type {
  NewsCandidate,
  NewsIngestionRun,
} from "@/features/news-ingestion/news-candidate.types";
import {
  getNewsAiProviderConfiguration,
  requestStructuredNewsAnalysis,
  type StructuredNewsAnalysisRequest,
} from "@/features/news-ingestion/news-ai-provider";
import { NewsAgentError } from "@/features/news-ingestion/news-agent.error";
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

const cardsEnvelopeSchema = z.object({ cards: z.array(z.unknown()).max(1) });

export interface FeedIngestionInput {
  days: number;
  maxCandidates: number;
  sourceIds?: string[];
  /** Skip network discovery and only drain articles already in the queue. */
  discover?: boolean;
}

export interface FeedIngestionDiagnostics {
  feedCount: number;
  entriesFound: number;
  entriesQueued: number;
  entriesAlreadyKnown: number;
  entriesReviewed: number;
  articlesRead: number;
  accepted: number;
  failed: number;
  retried: number;
  deadLettered: number;
  deadLettersRequeued: number;
  autoApproval: NewsAutoApprovalResult & { enabled: boolean };
  rejected: Array<{ sourceUrl: string; reasons: string[] }>;
  queue: NewsArticleQueueStats;
}

interface AcceptedArticleResult {
  kind: "accepted";
  article: QueuedNewsArticle;
  candidate: NewsCandidate;
  articleRead: boolean;
}

interface RejectedArticleResult {
  kind: "rejected";
  article: QueuedNewsArticle;
  reasons: string[];
  articleRead: boolean;
}

interface FailedArticleResult {
  kind: "failed";
  article: QueuedNewsArticle;
  queueStatus: "retry" | "dead-letter";
  articleRead: boolean;
  error: string;
}

type ArticleProcessingResult =
  | AcceptedArticleResult
  | RejectedArticleResult
  | FailedArticleResult;

function selectFeedSources(sourceIds?: string[]): NewsSource[] {
  const allowed = sourceIds?.length ? new Set(sourceIds) : null;
  return getFeedSources(newsSourceRegistry).filter(
    (source) => !allowed || allowed.has(source.id),
  );
}

/** Fetches readable article text without scripts, styles or page markup. */
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
      /charset=["']?([\w-]+)/i.exec(
        response.headers.get("content-type") ?? "",
      )?.[1] ?? "utf-8";
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

const cardsOutputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    cards: {
      type: "array",
      maxItems: 1,
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
          tags: {
            type: "array",
            minItems: 1,
            maxItems: 8,
            items: { type: "string" },
          },
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

export function buildCardsAnalysisRequest(
  articles: Array<FeedEntry & { text: string }>,
  maxCards: number,
): StructuredNewsAnalysisRequest {
  return {
    schemaName: "saletracker_feed_card",
    schema: cardsOutputSchema,
    systemPrompt:
      "Вы — редактор отраслевой аналитики SaleTracker. Вам передают текст одной публикации из проверенного издания. Определите, важна ли она поставщикам и закупщикам розничных сетей. Если важна — оформите одну карточку, если нет — верните пустой массив cards. Пишите по-русски, профессионально и без штампов. Используйте только факты из переданного текста: не додумывайте цифры, даты и названия. Карточка обязана содержать минимум один числовой показатель из текста. Верните данные как JSON-объект по переданной схеме.",
    userPrompt: [
      `Оформите не более ${Math.min(1, maxCards)} карточки.`,
      "Поле sourceUrl скопируйте буквально, не изменяя.",
      `Используйте только теги из каталога SaleTracker: ${digestTags.join(", ")}.`,
      "",
      ...articles.map(
        (article) =>
          `sourceUrl: ${article.url}\nИздание: ${article.sourceName}\nДата: ${article.publishedAt}\nЗаголовок: ${article.title}\nТекст: ${article.text || article.summary}`,
      ),
    ].join("\n"),
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index]);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(Math.max(1, concurrency), items.length) },
      () => worker(),
    ),
  );
  return results;
}

async function analyzeArticle(
  article: QueuedNewsArticle,
  sources: NewsSource[],
  earliestIso: string,
): Promise<
  | Omit<AcceptedArticleResult, "article">
  | (Omit<RejectedArticleResult, "article"> & { alreadyMarked?: boolean })
> {
  let text = article.articleText ?? "";
  let articleRead = false;

  if (!text) {
    const fetched = await fetchArticleText(article.sourceUrl);
    articleRead = Boolean(fetched);
    text = fetched || article.summary;

    if (text.trim().length < 30) {
      throw new Error("ARTICLE_TEXT_UNAVAILABLE");
    }

    const stored = await getNewsArticleQueueRepository().storeArticleText(
      article.id,
      text,
      new Date().toISOString(),
    );

    if (stored.duplicateOf) {
      return {
        kind: "rejected",
        reasons: [`duplicate-content:${stored.duplicateOf}`],
        articleRead,
        alreadyMarked: true,
      };
    }
  }

  const feedEntry: FeedEntry & { text: string } = {
    sourceId: article.sourceId,
    sourceName: article.sourceName,
    title: article.title,
    url: article.sourceUrl,
    publishedAt: article.publishedAt,
    summary: article.summary,
    text,
  };
  const outputText = await requestStructuredNewsAnalysis(
    buildCardsAnalysisRequest([feedEntry], 1),
    env.NEWS_AGENT_TIMEOUT_MS,
    { operation: "feed-analysis", newsArticleId: article.id },
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
      "Ответ модели не содержит корректного списка карточек.",
      502,
    );
  }

  if (!envelope.data.cards.length) {
    return { kind: "rejected", reasons: ["model-filtered"], articleRead };
  }

  const parsed = cardSchema.safeParse(envelope.data.cards[0]);

  if (!parsed.success) {
    return {
      kind: "rejected",
      reasons: parsed.error.issues
        .slice(0, 5)
        .map((issue) => `schema:${issue.path.join(".") || "?"}`),
      articleRead,
    };
  }

  const card = parsed.data;

  if (card.sourceUrl !== article.sourceUrl) {
    return {
      kind: "rejected",
      reasons: ["url-not-from-feed"],
      articleRead,
    };
  }

  const collectedAt = new Date().toISOString();
  const quality = checkCandidateQuality(
    {
      sourceUrl: card.sourceUrl,
      publishedAt: article.publishedAt,
      tags: card.tags,
      keyMetrics: card.keyMetrics,
    },
    sources,
    earliestIso,
    collectedAt,
  );

  if (!quality.accepted) {
    return {
      kind: "rejected",
      reasons: quality.reasons,
      articleRead,
    };
  }

  return {
    kind: "accepted",
    articleRead,
    candidate: {
      id: `candidate_${randomUUID()}`,
      title: card.title,
      sourceName: quality.source?.name ?? article.sourceName,
      sourceUrl: card.sourceUrl,
      publishedAt: article.publishedAt,
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
    },
  };
}

async function processClaimedArticle(
  article: QueuedNewsArticle,
  sources: NewsSource[],
  earliestIso: string,
): Promise<ArticleProcessingResult> {
  const queue = getNewsArticleQueueRepository();

  try {
    const result = await analyzeArticle(article, sources, earliestIso);

    if (result.kind === "rejected") {
      if (!result.alreadyMarked) {
        await queue.markRejected(
          article.id,
          result.reasons,
          new Date().toISOString(),
        );
      }

      return { ...result, article };
    }

    return { ...result, article };
  } catch (error) {
    const message =
      error instanceof NewsAgentError
        ? `${error.code}: ${error.message}`
        : error instanceof Error
          ? error.message
          : "UNKNOWN_ARTICLE_PROCESSING_ERROR";
    const queueStatus = await queue.markFailed(article.id, {
      error: message,
      maxAttempts: env.NEWS_PROCESSING_MAX_ATTEMPTS,
      retryDelayMs: env.NEWS_PROCESSING_RETRY_DELAY_MS,
      now: new Date().toISOString(),
    });

    return {
      kind: "failed",
      article,
      articleRead: false,
      queueStatus: queueStatus === "dead-letter" ? "dead-letter" : "retry",
      error: message,
    };
  }
}

export function assertFeedBatchSucceeded(
  reviewedCount: number,
  failures: string[],
  providerLabel: string,
): void {
  if (reviewedCount === 0 || failures.length !== reviewedCount) {
    return;
  }

  throw new NewsAgentError(
    "NEWS_INGESTION_BATCH_FAILED",
    `Не обработана ни одна публикация из ${reviewedCount}. Выбранный AI-провайдер: ${providerLabel}. Первая ошибка: ${failures[0] ?? "неизвестная ошибка"}`,
    502,
  );
}

export async function runFeedIngestion(input: FeedIngestionInput): Promise<{
  run: NewsIngestionRun;
  candidates: NewsCandidate[];
  diagnostics: FeedIngestionDiagnostics;
}> {
  const sources = selectFeedSources(input.sourceIds);

  if (!sources.length) {
    throw new NewsAgentError(
      "NO_ALLOWED_SOURCES",
      "Ни у одного выбранного источника нет ленты.",
      422,
    );
  }

  const queue = getNewsArticleQueueRepository();
  const startedAt = new Date().toISOString();
  const earliest = new Date(startedAt);
  earliest.setUTCDate(earliest.getUTCDate() - input.days);
  const earliestIso = earliest.toISOString();
  let entries: FeedEntry[] = [];

  if (input.discover !== false) {
    const feeds = await Promise.all(sources.map((source) => fetchFeed(source)));
    entries = selectFreshEntries(feeds.flat(), earliestIso, startedAt);
  }

  const enqueued = await queue.enqueue(entries, startedAt);
  const provider = getNewsAiProviderConfiguration();
  const candidateRepository = getNewsCandidateRepository();
  // Promotion is intentionally before the provider call: a quota or network
  // outage must not block candidates that were already enriched and verified
  // by an earlier run.
  const backlogAutoApproval = env.NEWS_AUTO_APPROVE
    ? await autoApproveNewsCandidates(
        await candidateRepository.listCandidates(100),
        env.NEWS_AUTO_APPROVE_MIN_CONFIDENCE,
        { candidates: candidateRepository },
      )
    : {
        eligible: 0,
        approved: 0,
        skipped: 0,
        failed: [],
      };

  if (!provider.configured) {
    throw new NewsAgentError(
      "NEWS_PROVIDER_NOT_CONFIGURED",
      `Публикации сохранены в очередь (${enqueued.created}), но для ${provider.providerLabel} нужен ${provider.credentialName}.`,
      503,
    );
  }

  const retryBefore = new Date(
    Date.parse(startedAt) - env.NEWS_DEAD_LETTER_RETRY_HOURS * 60 * 60_000,
  ).toISOString();
  const deadLettersRequeued = await queue.requeueRecoverableDeadLetters({
    limit: env.NEWS_DEAD_LETTER_REQUEUE_BATCH_SIZE,
    retryBefore,
    now: new Date().toISOString(),
  });

  const claimed = await queue.claim({
    limit: env.NEWS_PROCESSING_BATCH_SIZE,
    maxAttempts: env.NEWS_PROCESSING_MAX_ATTEMPTS,
    leaseMs: env.NEWS_PROCESSING_LEASE_MINUTES * 60_000,
    now: new Date().toISOString(),
  });
  const processingResults = await mapWithConcurrency(
    claimed,
    env.NEWS_PROCESSING_CONCURRENCY,
    (article) => processClaimedArticle(article, sources, earliestIso),
  );
  const acceptedResults = processingResults.filter(
    (result): result is AcceptedArticleResult => result.kind === "accepted",
  );
  const failedResults = processingResults.filter(
    (result): result is FailedArticleResult => result.kind === "failed",
  );

  assertFeedBatchSucceeded(
    processingResults.length,
    failedResults.map((result) => result.error),
    provider.providerLabel,
  );

  const candidates = acceptedResults.map((result) => result.candidate);
  const run: NewsIngestionRun = {
    id: `ingestion_${randomUUID()}`,
    startedAt,
    completedAt: new Date().toISOString(),
    model: `${provider.provider}/${provider.model}`,
    sourceCount: sources.length,
    candidateCount: candidates.length,
  };

  // Persist candidates before acknowledging queue rows. A failed transaction
  // leaves leases to expire, making the same work safely retryable.
  await candidateRepository.saveRun(run, candidates);
  const currentAutoApproval = env.NEWS_AUTO_APPROVE
    ? await autoApproveNewsCandidates(
        candidates,
        env.NEWS_AUTO_APPROVE_MIN_CONFIDENCE,
        { candidates: candidateRepository },
      )
    : {
        eligible: 0,
        approved: 0,
        skipped: candidates.length,
        failed: [],
      };
  const autoApproval: NewsAutoApprovalResult = {
    eligible:
      backlogAutoApproval.eligible + currentAutoApproval.eligible,
    approved:
      backlogAutoApproval.approved + currentAutoApproval.approved,
    skipped: backlogAutoApproval.skipped + currentAutoApproval.skipped,
    failed: [
      ...backlogAutoApproval.failed,
      ...currentAutoApproval.failed,
    ],
  };
  await Promise.all(
    acceptedResults.map((result) =>
      queue.markProcessed(result.article.id, new Date().toISOString()),
    ),
  );

  const rejected = processingResults
    .filter(
      (result): result is RejectedArticleResult => result.kind === "rejected",
    )
    .map((result) => ({
      sourceUrl: result.article.sourceUrl,
      reasons: result.reasons,
    }));
  const stats = await queue.getStats();

  return {
    run,
    candidates,
    diagnostics: {
      feedCount: sources.length,
      entriesFound: entries.length,
      entriesQueued: enqueued.created,
      entriesAlreadyKnown: enqueued.alreadyKnown,
      entriesReviewed: claimed.length,
      articlesRead: processingResults.filter((result) => result.articleRead)
        .length,
      accepted: candidates.length,
      failed: failedResults.length,
      retried: failedResults.filter((result) => result.queueStatus === "retry")
        .length,
      deadLettered: failedResults.filter(
        (result) => result.queueStatus === "dead-letter",
      ).length,
      deadLettersRequeued,
      autoApproval: { enabled: env.NEWS_AUTO_APPROVE, ...autoApproval },
      rejected,
      queue: stats,
    },
  };
}
