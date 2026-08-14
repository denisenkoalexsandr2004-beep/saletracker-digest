import { describe, expect, it } from "vitest";

import { InMemoryJobRunRepository } from "@/features/jobs/job-run.repository";
import { runIdempotentJob } from "@/features/jobs/job-run.service";

describe("runIdempotentJob", () => {
  it("выполняет один временной слот только один раз", async () => {
    const repository = new InMemoryJobRunRepository();
    let calls = 0;
    const input = {
      kind: "news-ingestion",
      idempotencyKey: "news-ingestion:2026-08-13T10",
      payload: {},
      repository,
      execute: async () => ({ candidates: ++calls }),
      now: () => "2026-08-13T10:00:00.000Z",
    };

    const first = await runIdempotentJob(input);
    const repeated = await runIdempotentJob(input);

    expect(first.executed).toBe(true);
    expect(repeated.executed).toBe(false);
    expect(calls).toBe(1);
  });

  it("повторяет временный сбой три раза и затем переводит job в dead-letter", async () => {
    const repository = new InMemoryJobRunRepository();
    let attempts = 0;
    const input = {
      kind: "digest-dispatch",
      idempotencyKey: "digest-dispatch:2026-08-13",
      payload: {},
      repository,
      execute: async () => {
        attempts += 1;
        throw new Error("Temporary upstream failure");
      },
      now: () => "2026-08-13T09:00:00.000Z",
    };

    await expect(runIdempotentJob(input)).rejects.toThrow();
    await expect(runIdempotentJob(input)).rejects.toThrow();
    await expect(runIdempotentJob(input)).rejects.toThrow();
    const deadLetter = await runIdempotentJob(input);

    expect(attempts).toBe(3);
    expect(deadLetter.executed).toBe(false);
    expect(deadLetter.run.status).toBe("dead-letter");
    expect(deadLetter.run.attemptCount).toBe(3);
  });
});
