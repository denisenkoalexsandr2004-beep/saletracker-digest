import { eq, sql } from "drizzle-orm";

import { getDatabase, type Database } from "@/shared/database/client";
import { jobRuns } from "@/shared/database/schema";

export type JobRunStatus =
  | "running"
  | "succeeded"
  | "failed"
  | "dead-letter";

export interface JobRunRecord {
  id: string;
  idempotencyKey: string;
  kind: string;
  status: JobRunStatus;
  attemptCount: number;
  payload: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type ClaimJobResult =
  | { status: "claimed"; run: JobRunRecord }
  | {
      status: "already-running" | "already-succeeded" | "dead-letter";
      run: JobRunRecord;
    };

const JOB_LEASE_MS = 15 * 60 * 1_000;
const MAX_JOB_ATTEMPTS = 3;

export interface JobRunRepository {
  claim(record: JobRunRecord): Promise<ClaimJobResult>;
  markSucceeded(
    id: string,
    result: Record<string, unknown>,
    completedAt: string,
  ): Promise<JobRunRecord>;
  markFailed(
    id: string,
    error: string,
    completedAt: string,
  ): Promise<JobRunRecord>;
}

type JobRow = typeof jobRuns.$inferSelect;

function mapJob(row: JobRow): JobRunRecord {
  return {
    id: row.id,
    idempotencyKey: row.idempotencyKey,
    kind: row.kind,
    status: row.status as JobRunStatus,
    attemptCount: row.attemptCount,
    payload: row.payload,
    result: row.result ?? undefined,
    error: row.error ?? undefined,
    startedAt: row.startedAt ?? undefined,
    completedAt: row.completedAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class PostgresJobRunRepository implements JobRunRepository {
  constructor(private readonly db: Database) {}

  async claim(record: JobRunRecord): Promise<ClaimJobResult> {
    const [created] = await this.db
      .insert(jobRuns)
      .values(record)
      .onConflictDoNothing({ target: jobRuns.idempotencyKey })
      .returning();

    if (created) {
      return { status: "claimed", run: mapJob(created) };
    }

    const [existing] = await this.db
      .select()
      .from(jobRuns)
      .where(eq(jobRuns.idempotencyKey, record.idempotencyKey))
      .limit(1);

    if (!existing) {
      throw new Error("Job idempotency record disappeared after conflict.");
    }

    if (existing.status === "succeeded") {
      return { status: "already-succeeded", run: mapJob(existing) };
    }

    if (
      existing.status === "running" &&
      Date.parse(record.updatedAt) - Date.parse(existing.updatedAt) < JOB_LEASE_MS
    ) {
      return { status: "already-running", run: mapJob(existing) };
    }

    if (
      existing.status === "dead-letter" ||
      existing.attemptCount >= MAX_JOB_ATTEMPTS
    ) {
      return { status: "dead-letter", run: mapJob(existing) };
    }

    const [retried] = await this.db
      .update(jobRuns)
      .set({
        status: "running",
        attemptCount: sql`${jobRuns.attemptCount} + 1`,
        startedAt: record.startedAt,
        completedAt: null,
        error: null,
        updatedAt: record.updatedAt,
      })
      .where(eq(jobRuns.id, existing.id))
      .returning();

    return { status: "claimed", run: mapJob(retried) };
  }

  async markSucceeded(
    id: string,
    result: Record<string, unknown>,
    completedAt: string,
  ): Promise<JobRunRecord> {
    return this.update(id, {
      status: "succeeded",
      result,
      completedAt,
      updatedAt: completedAt,
      error: null,
    });
  }

  async markFailed(
    id: string,
    error: string,
    completedAt: string,
  ): Promise<JobRunRecord> {
    const [current] = await this.db
      .select({ attemptCount: jobRuns.attemptCount })
      .from(jobRuns)
      .where(eq(jobRuns.id, id))
      .limit(1);
    return this.update(id, {
      status:
        (current?.attemptCount ?? MAX_JOB_ATTEMPTS) >= MAX_JOB_ATTEMPTS
          ? "dead-letter"
          : "failed",
      error,
      completedAt,
      updatedAt: completedAt,
    });
  }

  private async update(
    id: string,
    patch: Partial<typeof jobRuns.$inferInsert>,
  ): Promise<JobRunRecord> {
    const [row] = await this.db
      .update(jobRuns)
      .set(patch)
      .where(eq(jobRuns.id, id))
      .returning();

    if (!row) {
      throw new Error(`Job run not found: ${id}`);
    }

    return mapJob(row);
  }
}

export class InMemoryJobRunRepository implements JobRunRepository {
  private readonly byKey = new Map<string, JobRunRecord>();

  async claim(record: JobRunRecord): Promise<ClaimJobResult> {
    const existing = this.byKey.get(record.idempotencyKey);

    if (!existing) {
      this.byKey.set(record.idempotencyKey, record);
      return { status: "claimed", run: record };
    }

    if (existing.status === "succeeded") {
      return { status: "already-succeeded", run: existing };
    }

    if (
      existing.status === "running" &&
      Date.parse(record.updatedAt) - Date.parse(existing.updatedAt) < JOB_LEASE_MS
    ) {
      return { status: "already-running", run: existing };
    }

    if (
      existing.status === "dead-letter" ||
      existing.attemptCount >= MAX_JOB_ATTEMPTS
    ) {
      return { status: "dead-letter", run: existing };
    }

    const retried: JobRunRecord = {
      ...existing,
      status: "running",
      attemptCount: existing.attemptCount + 1,
      startedAt: record.startedAt,
      completedAt: undefined,
      error: undefined,
      updatedAt: record.updatedAt,
    };
    this.byKey.set(record.idempotencyKey, retried);
    return { status: "claimed", run: retried };
  }

  async markSucceeded(
    id: string,
    result: Record<string, unknown>,
    completedAt: string,
  ): Promise<JobRunRecord> {
    return this.update(id, {
      status: "succeeded",
      result,
      completedAt,
      updatedAt: completedAt,
      error: undefined,
    });
  }

  async markFailed(
    id: string,
    error: string,
    completedAt: string,
  ): Promise<JobRunRecord> {
    const current = [...this.byKey.values()].find((item) => item.id === id);
    return this.update(id, {
      status:
        (current?.attemptCount ?? MAX_JOB_ATTEMPTS) >= MAX_JOB_ATTEMPTS
          ? "dead-letter"
          : "failed",
      error,
      completedAt,
      updatedAt: completedAt,
    });
  }

  private update(
    id: string,
    patch: Partial<JobRunRecord>,
  ): JobRunRecord {
    const current = [...this.byKey.values()].find((item) => item.id === id);

    if (!current) {
      throw new Error(`Job run not found: ${id}`);
    }

    const updated = { ...current, ...patch };
    this.byKey.set(updated.idempotencyKey, updated);
    return updated;
  }
}

declare global {
  var saleTrackerJobRunRepository: JobRunRepository | undefined;
}

export function getJobRunRepository(): JobRunRepository {
  if (!globalThis.saleTrackerJobRunRepository) {
    const db = getDatabase();
    globalThis.saleTrackerJobRunRepository = db
      ? new PostgresJobRunRepository(db)
      : new InMemoryJobRunRepository();
  }

  return globalThis.saleTrackerJobRunRepository;
}
