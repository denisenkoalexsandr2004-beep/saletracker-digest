import { desc, eq } from "drizzle-orm";

import type {
  NewsCandidate,
  NewsIngestionRun,
} from "@/features/news-ingestion/news-candidate.types";
import { getDatabase, type Database } from "@/shared/database/client";
import {
  ingestionRuns,
  newsCandidates,
} from "@/shared/database/schema";

type RepositoryResult<T> = T | Promise<T>;

export interface NewsCandidateRepository {
  saveRun(
    run: NewsIngestionRun,
    candidates: NewsCandidate[],
  ): RepositoryResult<void>;
  listCandidates(limit?: number): RepositoryResult<NewsCandidate[]>;
  listRuns(limit?: number): RepositoryResult<NewsIngestionRun[]>;
  findById(id: string): RepositoryResult<NewsCandidate | null>;
  updateStatus(
    id: string,
    status: NewsCandidate["status"],
  ): RepositoryResult<NewsCandidate | null>;
}

export class PostgresNewsCandidateRepository
  implements NewsCandidateRepository
{
  constructor(private readonly db: Database) {}

  async saveRun(
    run: NewsIngestionRun,
    candidates: NewsCandidate[],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.insert(ingestionRuns).values({
        ...run,
        createdAt: run.startedAt,
        updatedAt: run.completedAt,
      });

      if (candidates.length) {
        await tx
          .insert(newsCandidates)
          .values(
            candidates.map((candidate) => ({
              ...candidate,
              ingestionRunId: run.id,
              createdAt: candidate.collectedAt,
              updatedAt: candidate.collectedAt,
            })),
          )
          .onConflictDoNothing({ target: newsCandidates.sourceUrl });
      }
    });
  }

  async listCandidates(limit = 30): Promise<NewsCandidate[]> {
    const rows = await this.db
      .select()
      .from(newsCandidates)
      .orderBy(desc(newsCandidates.collectedAt))
      .limit(Math.max(1, Math.min(limit, 100)));

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      sourceName: row.sourceName,
      sourceUrl: row.sourceUrl,
      publishedAt: row.publishedAt,
      collectedAt: row.collectedAt,
      summary: row.summary,
      marketImpact: row.marketImpact,
      businessImpact: row.businessImpact,
      keyMetrics: row.keyMetrics,
      tags: row.tags,
      confidence: row.confidence,
      status: row.status as NewsCandidate["status"],
      verificationStatus:
        row.verificationStatus as NewsCandidate["verificationStatus"],
      verificationReasons: row.verificationReasons,
    }));
  }

  async listRuns(limit = 10): Promise<NewsIngestionRun[]> {
    const rows = await this.db
      .select()
      .from(ingestionRuns)
      .orderBy(desc(ingestionRuns.startedAt))
      .limit(Math.max(1, Math.min(limit, 20)));

    return rows.map((row) => ({
      id: row.id,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      model: row.model,
      sourceCount: row.sourceCount,
      candidateCount: row.candidateCount,
    }));
  }

  async findById(id: string): Promise<NewsCandidate | null> {
    const [row] = await this.db
      .select()
      .from(newsCandidates)
      .where(eq(newsCandidates.id, id))
      .limit(1);
    return row ? mapCandidate(row) : null;
  }

  async updateStatus(
    id: string,
    status: NewsCandidate["status"],
  ): Promise<NewsCandidate | null> {
    const [row] = await this.db
      .update(newsCandidates)
      .set({ status, updatedAt: new Date().toISOString() })
      .where(eq(newsCandidates.id, id))
      .returning();
    return row ? mapCandidate(row) : null;
  }
}

type CandidateRow = typeof newsCandidates.$inferSelect;

function mapCandidate(row: CandidateRow): NewsCandidate {
  return {
    id: row.id,
    title: row.title,
    sourceName: row.sourceName,
    sourceUrl: row.sourceUrl,
    publishedAt: row.publishedAt,
    collectedAt: row.collectedAt,
    summary: row.summary,
    marketImpact: row.marketImpact,
    businessImpact: row.businessImpact,
    keyMetrics: row.keyMetrics,
    tags: row.tags,
    confidence: row.confidence,
    status: row.status as NewsCandidate["status"],
    verificationStatus:
      row.verificationStatus as NewsCandidate["verificationStatus"],
    verificationReasons: row.verificationReasons,
  };
}

export class InMemoryNewsCandidateRepository
  implements NewsCandidateRepository
{
  private readonly candidates = new Map<string, NewsCandidate>();
  private readonly runs: NewsIngestionRun[] = [];

  saveRun(run: NewsIngestionRun, candidates: NewsCandidate[]) {
    for (const candidate of candidates) {
      const duplicate = [...this.candidates.values()].find(
        (item) => item.sourceUrl === candidate.sourceUrl,
      );

      if (!duplicate) {
        this.candidates.set(candidate.id, candidate);
      }
    }

    this.runs.unshift(run);
    this.runs.splice(20);
  }

  listCandidates(limit = 30): NewsCandidate[] {
    return [...this.candidates.values()]
      .sort((left, right) => right.collectedAt.localeCompare(left.collectedAt))
      .slice(0, Math.max(1, Math.min(limit, 100)));
  }

  listRuns(limit = 10): NewsIngestionRun[] {
    return this.runs.slice(0, Math.max(1, Math.min(limit, 20)));
  }

  findById(id: string): NewsCandidate | null {
    return this.candidates.get(id) ?? null;
  }

  updateStatus(
    id: string,
    status: NewsCandidate["status"],
  ): NewsCandidate | null {
    const candidate = this.candidates.get(id);

    if (!candidate) {
      return null;
    }

    const updated = { ...candidate, status };
    this.candidates.set(id, updated);
    return updated;
  }
}

declare global {
  var saleTrackerNewsCandidateRepository:
    | NewsCandidateRepository
    | undefined;
}

export function getNewsCandidateRepository(): NewsCandidateRepository {
  if (!globalThis.saleTrackerNewsCandidateRepository) {
    const db = getDatabase();
    globalThis.saleTrackerNewsCandidateRepository = db
      ? new PostgresNewsCandidateRepository(db)
      : new InMemoryNewsCandidateRepository();
  }

  return globalThis.saleTrackerNewsCandidateRepository;
}
