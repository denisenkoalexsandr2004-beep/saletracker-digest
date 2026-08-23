import { createHash } from "node:crypto";

import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  like,
  lt,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";

import type { FeedEntry } from "@/features/news-ingestion/rss-feed";
import { getDatabase, type Database } from "@/shared/database/client";
import { newsArticles } from "@/shared/database/schema";

export type NewsArticleQueueStatus =
  | "pending"
  | "processing"
  | "retry"
  | "processed"
  | "rejected"
  | "dead-letter";

export interface QueuedNewsArticle {
  id: string;
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  canonicalUrl: string;
  title: string;
  summary: string;
  publishedAt: string;
  articleText?: string;
  contentHash?: string;
  status: NewsArticleQueueStatus;
  attemptCount: number;
  processingStartedAt?: string;
  nextAttemptAt: string;
  processedAt?: string;
  lastError?: string;
  rejectionReasons: string[];
  discoveredAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface NewsArticleQueueStats {
  total: number;
  pending: number;
  processing: number;
  retry: number;
  processed: number;
  rejected: number;
  deadLetter: number;
}

export interface EnqueueArticlesResult {
  discovered: number;
  created: number;
  alreadyKnown: number;
}

export interface ClaimArticlesOptions {
  limit: number;
  maxAttempts: number;
  leaseMs: number;
  now: string;
}

export interface MarkArticleFailedOptions {
  error: string;
  maxAttempts: number;
  retryDelayMs: number;
  now: string;
}

export interface RequeueDeadLettersOptions {
  limit: number;
  retryBefore: string;
  now: string;
}

export interface NewsArticleQueueRepository {
  enqueue(
    entries: FeedEntry[],
    discoveredAt: string,
  ): Promise<EnqueueArticlesResult>;
  claim(options: ClaimArticlesOptions): Promise<QueuedNewsArticle[]>;
  storeArticleText(
    id: string,
    text: string,
    now: string,
  ): Promise<{ duplicateOf?: string }>;
  markProcessed(id: string, now: string): Promise<void>;
  markRejected(id: string, reasons: string[], now: string): Promise<void>;
  markFailed(
    id: string,
    options: MarkArticleFailedOptions,
  ): Promise<NewsArticleQueueStatus>;
  requeueRecoverableDeadLetters(
    options: RequeueDeadLettersOptions,
  ): Promise<number>;
  getStats(): Promise<NewsArticleQueueStats>;
}

const trackingParameters = new Set([
  "fbclid",
  "gclid",
  "yclid",
  "from",
  "ref",
  "source",
]);

/** Stable identity used only for deduplication; the original URL is preserved. */
export function canonicalizeArticleUrl(value: string): string {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  const pathname = url.pathname.replace(/\/+$/, "") || "/";

  for (const key of [...url.searchParams.keys()]) {
    const normalized = key.toLowerCase();

    if (normalized.startsWith("utm_") || trackingParameters.has(normalized)) {
      url.searchParams.delete(key);
    }
  }

  url.searchParams.sort();
  const query = url.searchParams.toString();
  return `${hostname}${pathname}${query ? `?${query}` : ""}`;
}

export function createArticleContentHash(text: string): string {
  return createHash("sha256")
    .update(text.replace(/\s+/g, " ").trim())
    .digest("hex");
}

function createArticleId(canonicalUrl: string): string {
  return `article_${createHash("sha256").update(canonicalUrl).digest("hex").slice(0, 32)}`;
}

type ArticleRow = typeof newsArticles.$inferSelect;

function mapArticle(row: ArticleRow): QueuedNewsArticle {
  return {
    id: row.id,
    sourceId: row.sourceId,
    sourceName: row.sourceName,
    sourceUrl: row.sourceUrl,
    canonicalUrl: row.canonicalUrl,
    title: row.title,
    summary: row.summary,
    publishedAt: row.publishedAt,
    articleText: row.articleText ?? undefined,
    contentHash: row.contentHash ?? undefined,
    status: row.status as NewsArticleQueueStatus,
    attemptCount: row.attemptCount,
    processingStartedAt: row.processingStartedAt ?? undefined,
    nextAttemptAt: row.nextAttemptAt,
    processedAt: row.processedAt ?? undefined,
    lastError: row.lastError ?? undefined,
    rejectionReasons: row.rejectionReasons,
    discoveredAt: row.discoveredAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function emptyStats(): NewsArticleQueueStats {
  return {
    total: 0,
    pending: 0,
    processing: 0,
    retry: 0,
    processed: 0,
    rejected: 0,
    deadLetter: 0,
  };
}

export class PostgresNewsArticleQueueRepository
  implements NewsArticleQueueRepository
{
  constructor(private readonly db: Database) {}

  async enqueue(
    entries: FeedEntry[],
    discoveredAt: string,
  ): Promise<EnqueueArticlesResult> {
    const prepared = entries.flatMap((entry) => {
      try {
        const canonicalUrl = canonicalizeArticleUrl(entry.url);
        return [
          {
            id: createArticleId(canonicalUrl),
            sourceId: entry.sourceId,
            sourceName: entry.sourceName,
            sourceUrl: entry.url,
            canonicalUrl,
            title: entry.title,
            summary: entry.summary,
            publishedAt: entry.publishedAt,
            status: "pending",
            attemptCount: 0,
            nextAttemptAt: discoveredAt,
            rejectionReasons: [],
            discoveredAt,
            createdAt: discoveredAt,
            updatedAt: discoveredAt,
          },
        ];
      } catch {
        return [];
      }
    });

    if (!prepared.length) {
      return { discovered: entries.length, created: 0, alreadyKnown: 0 };
    }

    const created = await this.db
      .insert(newsArticles)
      .values(prepared)
      .onConflictDoNothing({ target: newsArticles.canonicalUrl })
      .returning({ id: newsArticles.id });

    return {
      discovered: entries.length,
      created: created.length,
      alreadyKnown: prepared.length - created.length,
    };
  }

  async claim(options: ClaimArticlesOptions): Promise<QueuedNewsArticle[]> {
    const limit = Math.max(1, Math.min(options.limit, 100));
    const staleBefore = new Date(
      Date.parse(options.now) - options.leaseMs,
    ).toISOString();

    return this.db.transaction(async (tx) => {
      // A worker that died on its final attempt must not leave a permanent
      // `processing` row behind.
      await tx
        .update(newsArticles)
        .set({
          status: "dead-letter",
          lastError: "PROCESSING_LEASE_EXPIRED",
          processingStartedAt: null,
          processedAt: options.now,
          updatedAt: options.now,
        })
        .where(
          and(
            eq(newsArticles.status, "processing"),
            lt(newsArticles.processingStartedAt, staleBefore),
            gte(newsArticles.attemptCount, options.maxAttempts),
          ),
        );

      const selected = await tx
        .select()
        .from(newsArticles)
        .where(
          and(
            lt(newsArticles.attemptCount, options.maxAttempts),
            or(
              eq(newsArticles.status, "pending"),
              and(
                eq(newsArticles.status, "retry"),
                lte(newsArticles.nextAttemptAt, options.now),
              ),
              and(
                eq(newsArticles.status, "processing"),
                lt(newsArticles.processingStartedAt, staleBefore),
              ),
            ),
          ),
        )
        .orderBy(
          asc(newsArticles.nextAttemptAt),
          desc(newsArticles.publishedAt),
        )
        .limit(limit)
        .for("update", { skipLocked: true });

      if (!selected.length) {
        return [];
      }

      const claimed = await tx
        .update(newsArticles)
        .set({
          status: "processing",
          attemptCount: sql`${newsArticles.attemptCount} + 1`,
          processingStartedAt: options.now,
          lastError: null,
          updatedAt: options.now,
        })
        .where(inArray(newsArticles.id, selected.map((row) => row.id)))
        .returning();

      return claimed.map(mapArticle);
    });
  }

  async storeArticleText(
    id: string,
    text: string,
    now: string,
  ): Promise<{ duplicateOf?: string }> {
    const contentHash = createArticleContentHash(text);
    const duplicate = await this.findDuplicateContent(id, contentHash);

    if (duplicate) {
      await this.markRejected(id, [`duplicate-content:${duplicate}`], now);
      return { duplicateOf: duplicate };
    }

    try {
      await this.db
        .update(newsArticles)
        .set({ articleText: text, contentHash, updatedAt: now })
        .where(eq(newsArticles.id, id));
      return {};
    } catch (error) {
      if ((error as { code?: string })?.code !== "23505") {
        throw error;
      }

      const racedDuplicate = await this.findDuplicateContent(id, contentHash);

      if (!racedDuplicate) {
        throw error;
      }

      await this.markRejected(
        id,
        [`duplicate-content:${racedDuplicate}`],
        now,
      );
      return { duplicateOf: racedDuplicate };
    }
  }

  async markProcessed(id: string, now: string): Promise<void> {
    await this.db
      .update(newsArticles)
      .set({
        status: "processed",
        processedAt: now,
        processingStartedAt: null,
        lastError: null,
        rejectionReasons: [],
        updatedAt: now,
      })
      .where(eq(newsArticles.id, id));
  }

  async markRejected(
    id: string,
    reasons: string[],
    now: string,
  ): Promise<void> {
    await this.db
      .update(newsArticles)
      .set({
        status: "rejected",
        processedAt: now,
        processingStartedAt: null,
        lastError: null,
        rejectionReasons: reasons,
        updatedAt: now,
      })
      .where(eq(newsArticles.id, id));
  }

  async markFailed(
    id: string,
    options: MarkArticleFailedOptions,
  ): Promise<NewsArticleQueueStatus> {
    const [current] = await this.db
      .select({ attemptCount: newsArticles.attemptCount })
      .from(newsArticles)
      .where(eq(newsArticles.id, id))
      .limit(1);
    const exhausted = (current?.attemptCount ?? options.maxAttempts) >= options.maxAttempts;
    const status: NewsArticleQueueStatus = exhausted ? "dead-letter" : "retry";
    const multiplier = Math.max(1, 2 ** Math.max(0, (current?.attemptCount ?? 1) - 1));
    const delayMs = Math.min(
      options.retryDelayMs * multiplier,
      24 * 60 * 60_000,
    );
    const nextAttemptAt = new Date(
      Date.parse(options.now) + delayMs,
    ).toISOString();

    await this.db
      .update(newsArticles)
      .set({
        status,
        nextAttemptAt,
        processingStartedAt: null,
        processedAt: exhausted ? options.now : null,
        lastError: options.error.slice(0, 2_000),
        updatedAt: options.now,
      })
      .where(eq(newsArticles.id, id));

    return status;
  }

  async requeueRecoverableDeadLetters(
    options: RequeueDeadLettersOptions,
  ): Promise<number> {
    const limit = Math.max(1, Math.min(options.limit, 100));

    return this.db.transaction(async (tx) => {
      const selected = await tx
        .select({ id: newsArticles.id })
        .from(newsArticles)
        .where(
          and(
            eq(newsArticles.status, "dead-letter"),
            lte(newsArticles.updatedAt, options.retryBefore),
            or(
              like(newsArticles.lastError, "NEWS_PROVIDER_%"),
              like(newsArticles.lastError, "OPENAI_%"),
            ),
          ),
        )
        .orderBy(asc(newsArticles.updatedAt))
        .limit(limit)
        .for("update", { skipLocked: true });

      if (!selected.length) {
        return 0;
      }

      const requeued = await tx
        .update(newsArticles)
        .set({
          status: "retry",
          attemptCount: 0,
          processingStartedAt: null,
          processedAt: null,
          nextAttemptAt: options.now,
          updatedAt: options.now,
        })
        .where(inArray(newsArticles.id, selected.map((row) => row.id)))
        .returning({ id: newsArticles.id });
      return requeued.length;
    });
  }

  async getStats(): Promise<NewsArticleQueueStats> {
    const rows = await this.db
      .select({ status: newsArticles.status, amount: count() })
      .from(newsArticles)
      .groupBy(newsArticles.status);
    const stats = emptyStats();

    for (const row of rows) {
      const amount = Number(row.amount);
      stats.total += amount;

      switch (row.status as NewsArticleQueueStatus) {
        case "pending":
          stats.pending = amount;
          break;
        case "processing":
          stats.processing = amount;
          break;
        case "retry":
          stats.retry = amount;
          break;
        case "processed":
          stats.processed = amount;
          break;
        case "rejected":
          stats.rejected = amount;
          break;
        case "dead-letter":
          stats.deadLetter = amount;
          break;
      }
    }

    return stats;
  }

  private async findDuplicateContent(
    id: string,
    contentHash: string,
  ): Promise<string | undefined> {
    const [duplicate] = await this.db
      .select({ id: newsArticles.id })
      .from(newsArticles)
      .where(
        and(
          eq(newsArticles.contentHash, contentHash),
          ne(newsArticles.id, id),
        ),
      )
      .limit(1);
    return duplicate?.id;
  }
}

export class InMemoryNewsArticleQueueRepository
  implements NewsArticleQueueRepository
{
  private readonly articles = new Map<string, QueuedNewsArticle>();

  async enqueue(
    entries: FeedEntry[],
    discoveredAt: string,
  ): Promise<EnqueueArticlesResult> {
    let created = 0;

    for (const entry of entries) {
      let canonicalUrl: string;

      try {
        canonicalUrl = canonicalizeArticleUrl(entry.url);
      } catch {
        continue;
      }

      if (
        [...this.articles.values()].some(
          (article) => article.canonicalUrl === canonicalUrl,
        )
      ) {
        continue;
      }

      const id = createArticleId(canonicalUrl);
      this.articles.set(id, {
        id,
        sourceId: entry.sourceId,
        sourceName: entry.sourceName,
        sourceUrl: entry.url,
        canonicalUrl,
        title: entry.title,
        summary: entry.summary,
        publishedAt: entry.publishedAt,
        status: "pending",
        attemptCount: 0,
        nextAttemptAt: discoveredAt,
        rejectionReasons: [],
        discoveredAt,
        createdAt: discoveredAt,
        updatedAt: discoveredAt,
      });
      created += 1;
    }

    return {
      discovered: entries.length,
      created,
      alreadyKnown: entries.length - created,
    };
  }

  async claim(options: ClaimArticlesOptions): Promise<QueuedNewsArticle[]> {
    const staleBefore = Date.parse(options.now) - options.leaseMs;

    for (const article of this.articles.values()) {
      if (
        article.status === "processing" &&
        Date.parse(article.processingStartedAt ?? article.updatedAt) <= staleBefore &&
        article.attemptCount >= options.maxAttempts
      ) {
        Object.assign(article, {
          status: "dead-letter",
          lastError: "PROCESSING_LEASE_EXPIRED",
          processingStartedAt: undefined,
          processedAt: options.now,
          updatedAt: options.now,
        });
      }
    }

    const eligible = [...this.articles.values()]
      .filter((article) => {
        if (article.attemptCount >= options.maxAttempts) {
          return false;
        }

        if (article.status === "pending") {
          return true;
        }

        if (article.status === "retry") {
          return Date.parse(article.nextAttemptAt) <= Date.parse(options.now);
        }

        return (
          article.status === "processing" &&
          Date.parse(article.processingStartedAt ?? article.updatedAt) <= staleBefore
        );
      })
      .sort(
        (left, right) =>
          left.nextAttemptAt.localeCompare(right.nextAttemptAt) ||
          right.publishedAt.localeCompare(left.publishedAt),
      )
      .slice(0, Math.max(1, Math.min(options.limit, 100)));

    return eligible.map((article) => {
      const claimed: QueuedNewsArticle = {
        ...article,
        status: "processing",
        attemptCount: article.attemptCount + 1,
        processingStartedAt: options.now,
        lastError: undefined,
        updatedAt: options.now,
      };
      this.articles.set(article.id, claimed);
      return { ...claimed };
    });
  }

  async storeArticleText(
    id: string,
    text: string,
    now: string,
  ): Promise<{ duplicateOf?: string }> {
    const article = this.requireArticle(id);
    const contentHash = createArticleContentHash(text);
    const duplicate = [...this.articles.values()].find(
      (item) => item.id !== id && item.contentHash === contentHash,
    );

    if (duplicate) {
      await this.markRejected(id, [`duplicate-content:${duplicate.id}`], now);
      return { duplicateOf: duplicate.id };
    }

    this.articles.set(id, {
      ...article,
      articleText: text,
      contentHash,
      updatedAt: now,
    });
    return {};
  }

  async markProcessed(id: string, now: string): Promise<void> {
    this.articles.set(id, {
      ...this.requireArticle(id),
      status: "processed",
      processedAt: now,
      processingStartedAt: undefined,
      lastError: undefined,
      rejectionReasons: [],
      updatedAt: now,
    });
  }

  async markRejected(
    id: string,
    reasons: string[],
    now: string,
  ): Promise<void> {
    this.articles.set(id, {
      ...this.requireArticle(id),
      status: "rejected",
      processedAt: now,
      processingStartedAt: undefined,
      lastError: undefined,
      rejectionReasons: reasons,
      updatedAt: now,
    });
  }

  async markFailed(
    id: string,
    options: MarkArticleFailedOptions,
  ): Promise<NewsArticleQueueStatus> {
    const article = this.requireArticle(id);
    const exhausted = article.attemptCount >= options.maxAttempts;
    const status: NewsArticleQueueStatus = exhausted ? "dead-letter" : "retry";
    const multiplier = Math.max(1, 2 ** Math.max(0, article.attemptCount - 1));

    this.articles.set(id, {
      ...article,
      status,
      nextAttemptAt: new Date(
        Date.parse(options.now) +
          Math.min(
            options.retryDelayMs * multiplier,
            24 * 60 * 60_000,
          ),
      ).toISOString(),
      processingStartedAt: undefined,
      processedAt: exhausted ? options.now : undefined,
      lastError: options.error.slice(0, 2_000),
      updatedAt: options.now,
    });
    return status;
  }

  async requeueRecoverableDeadLetters(
    options: RequeueDeadLettersOptions,
  ): Promise<number> {
    const recoverable = [...this.articles.values()]
      .filter(
        (article) =>
          article.status === "dead-letter" &&
          article.updatedAt <= options.retryBefore &&
          /^(NEWS_PROVIDER_|OPENAI_)/u.test(article.lastError ?? ""),
      )
      .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
      .slice(0, Math.max(1, Math.min(options.limit, 100)));

    for (const article of recoverable) {
      this.articles.set(article.id, {
        ...article,
        status: "retry",
        attemptCount: 0,
        processingStartedAt: undefined,
        processedAt: undefined,
        nextAttemptAt: options.now,
        updatedAt: options.now,
      });
    }

    return recoverable.length;
  }

  async getStats(): Promise<NewsArticleQueueStats> {
    const stats = emptyStats();

    for (const article of this.articles.values()) {
      stats.total += 1;

      if (article.status === "dead-letter") {
        stats.deadLetter += 1;
      } else {
        stats[article.status] += 1;
      }
    }

    return stats;
  }

  private requireArticle(id: string): QueuedNewsArticle {
    const article = this.articles.get(id);

    if (!article) {
      throw new Error(`News article not found: ${id}`);
    }

    return article;
  }
}

declare global {
  var saleTrackerNewsArticleQueueRepository:
    | NewsArticleQueueRepository
    | undefined;
}

export function getNewsArticleQueueRepository(): NewsArticleQueueRepository {
  if (!globalThis.saleTrackerNewsArticleQueueRepository) {
    const db = getDatabase();
    globalThis.saleTrackerNewsArticleQueueRepository = db
      ? new PostgresNewsArticleQueueRepository(db)
      : new InMemoryNewsArticleQueueRepository();
  }

  return globalThis.saleTrackerNewsArticleQueueRepository;
}
