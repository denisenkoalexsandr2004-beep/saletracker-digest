import { randomUUID } from "node:crypto";

import {
  getJobRunRepository,
  type JobRunRecord,
  type JobRunRepository,
} from "@/features/jobs/job-run.repository";

interface RunIdempotentJobInput<T extends Record<string, unknown>> {
  kind: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  execute: () => Promise<T>;
  now?: () => string;
  repository?: JobRunRepository;
}

export async function runIdempotentJob<T extends Record<string, unknown>>(
  input: RunIdempotentJobInput<T>,
): Promise<{ run: JobRunRecord; executed: boolean }> {
  const repository = input.repository ?? getJobRunRepository();
  const now = input.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const claim = await repository.claim({
    id: `job_${randomUUID()}`,
    idempotencyKey: input.idempotencyKey,
    kind: input.kind,
    status: "running",
    attemptCount: 1,
    payload: input.payload,
    startedAt,
    createdAt: startedAt,
    updatedAt: startedAt,
  });

  if (claim.status !== "claimed") {
    return { run: claim.run, executed: false };
  }

  try {
    const result = await input.execute();
    const run = await repository.markSucceeded(claim.run.id, result, now());
    return { run, executed: true };
  } catch (error) {
    await repository.markFailed(
      claim.run.id,
      error instanceof Error ? error.message : "UNKNOWN_JOB_ERROR",
      now(),
    );
    throw error;
  }
}
