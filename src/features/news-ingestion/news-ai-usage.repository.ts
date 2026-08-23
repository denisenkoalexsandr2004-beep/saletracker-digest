import { createHash, randomUUID } from "node:crypto";

import { gte, sql } from "drizzle-orm";

import type {
  NewsAiUsage,
  NewsAiUsageEvent,
  NewsAiUsageOperation,
  NewsAiUsageSummary,
  NewsAiUsageTotals,
} from "@/features/news-ingestion/news-ai-usage.types";
import { getDatabase, type Database } from "@/shared/database/client";
import { newsAiUsageEvents } from "@/shared/database/schema";

export interface RecordNewsAiUsageInput extends NewsAiUsage {
  newsArticleId?: string;
  operation: NewsAiUsageOperation;
  createdAt: string;
}

export interface NewsAiUsageRepository {
  record(input: RecordNewsAiUsageInput): Promise<void>;
  getSummary(now?: string): Promise<NewsAiUsageSummary>;
}

function emptyTotals(): NewsAiUsageTotals {
  return {
    requestCount: 0,
    pricedRequestCount: 0,
    unpricedRequestCount: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    costUsdMicros: 0,
  };
}

function createUsageEventId(input: RecordNewsAiUsageInput): string {
  if (!input.providerRequestId) {
    return `ai_usage_${randomUUID()}`;
  }

  return `ai_usage_${createHash("sha256")
    .update(`${input.provider}:${input.providerRequestId}`)
    .digest("hex")
    .slice(0, 32)}`;
}

export function summarizeNewsAiUsageEvents(
  events: readonly NewsAiUsageEvent[],
): NewsAiUsageTotals {
  return events.reduce<NewsAiUsageTotals>((totals, event) => {
    totals.requestCount += 1;
    totals.inputTokens += event.inputTokens;
    totals.cachedInputTokens += event.cachedInputTokens;
    totals.cacheWriteTokens += event.cacheWriteTokens;
    totals.outputTokens += event.outputTokens;
    totals.reasoningTokens += event.reasoningTokens;
    totals.totalTokens += event.totalTokens;

    if (event.costUsdMicros === undefined) {
      totals.unpricedRequestCount += 1;
    } else {
      totals.pricedRequestCount += 1;
      totals.costUsdMicros += event.costUsdMicros;
    }

    return totals;
  }, emptyTotals());
}

function normalizeTotals(row: Record<string, unknown>): NewsAiUsageTotals {
  return {
    requestCount: Number(row.requestCount ?? 0),
    pricedRequestCount: Number(row.pricedRequestCount ?? 0),
    unpricedRequestCount: Number(row.unpricedRequestCount ?? 0),
    inputTokens: Number(row.inputTokens ?? 0),
    cachedInputTokens: Number(row.cachedInputTokens ?? 0),
    cacheWriteTokens: Number(row.cacheWriteTokens ?? 0),
    outputTokens: Number(row.outputTokens ?? 0),
    reasoningTokens: Number(row.reasoningTokens ?? 0),
    totalTokens: Number(row.totalTokens ?? 0),
    costUsdMicros: Number(row.costUsdMicros ?? 0),
  };
}

export class PostgresNewsAiUsageRepository
  implements NewsAiUsageRepository
{
  constructor(private readonly db: Database) {}

  async record(input: RecordNewsAiUsageInput): Promise<void> {
    await this.db
      .insert(newsAiUsageEvents)
      .values({
        id: createUsageEventId(input),
        newsArticleId: input.newsArticleId,
        providerRequestId: input.providerRequestId,
        provider: input.provider,
        model: input.model,
        operation: input.operation,
        inputTokens: input.inputTokens,
        cachedInputTokens: input.cachedInputTokens,
        cacheWriteTokens: input.cacheWriteTokens,
        outputTokens: input.outputTokens,
        reasoningTokens: input.reasoningTokens,
        totalTokens: input.totalTokens,
        costUsdMicros: input.costUsdMicros,
        costSource: input.costSource,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      })
      .onConflictDoNothing();
  }

  async getSummary(now = new Date().toISOString()): Promise<NewsAiUsageSummary> {
    const last24HoursStart = new Date(
      Date.parse(now) - 24 * 60 * 60_000,
    ).toISOString();
    const selection = {
      requestCount: sql<number>`count(*)::int`,
      pricedRequestCount: sql<number>`count(${newsAiUsageEvents.costUsdMicros})::int`,
      unpricedRequestCount: sql<number>`(count(*) - count(${newsAiUsageEvents.costUsdMicros}))::int`,
      inputTokens: sql<string>`coalesce(sum(${newsAiUsageEvents.inputTokens}), 0)::text`,
      cachedInputTokens: sql<string>`coalesce(sum(${newsAiUsageEvents.cachedInputTokens}), 0)::text`,
      cacheWriteTokens: sql<string>`coalesce(sum(${newsAiUsageEvents.cacheWriteTokens}), 0)::text`,
      outputTokens: sql<string>`coalesce(sum(${newsAiUsageEvents.outputTokens}), 0)::text`,
      reasoningTokens: sql<string>`coalesce(sum(${newsAiUsageEvents.reasoningTokens}), 0)::text`,
      totalTokens: sql<string>`coalesce(sum(${newsAiUsageEvents.totalTokens}), 0)::text`,
      costUsdMicros: sql<string>`coalesce(sum(${newsAiUsageEvents.costUsdMicros}), 0)::text`,
    };
    const [allTimeRows, last24HoursRows] = await Promise.all([
      this.db.select(selection).from(newsAiUsageEvents),
      this.db
        .select(selection)
        .from(newsAiUsageEvents)
        .where(gte(newsAiUsageEvents.createdAt, last24HoursStart)),
    ]);

    return {
      currency: "USD",
      allTime: normalizeTotals(allTimeRows[0] ?? {}),
      last24Hours: normalizeTotals(last24HoursRows[0] ?? {}),
      generatedAt: now,
    };
  }
}

export class InMemoryNewsAiUsageRepository
  implements NewsAiUsageRepository
{
  private readonly events = new Map<string, NewsAiUsageEvent>();

  async record(input: RecordNewsAiUsageInput): Promise<void> {
    const id = createUsageEventId(input);

    if (this.events.has(id)) {
      return;
    }

    this.events.set(id, {
      ...input,
      id,
      updatedAt: input.createdAt,
    });
  }

  async getSummary(now = new Date().toISOString()): Promise<NewsAiUsageSummary> {
    const events = [...this.events.values()];
    const last24HoursStart = Date.parse(now) - 24 * 60 * 60_000;

    return {
      currency: "USD",
      allTime: summarizeNewsAiUsageEvents(events),
      last24Hours: summarizeNewsAiUsageEvents(
        events.filter((event) => Date.parse(event.createdAt) >= last24HoursStart),
      ),
      generatedAt: now,
    };
  }
}

declare global {
  var saleTrackerNewsAiUsageRepository: NewsAiUsageRepository | undefined;
}

export function getNewsAiUsageRepository(): NewsAiUsageRepository {
  if (!globalThis.saleTrackerNewsAiUsageRepository) {
    const db = getDatabase();
    globalThis.saleTrackerNewsAiUsageRepository = db
      ? new PostgresNewsAiUsageRepository(db)
      : new InMemoryNewsAiUsageRepository();
  }

  return globalThis.saleTrackerNewsAiUsageRepository;
}
