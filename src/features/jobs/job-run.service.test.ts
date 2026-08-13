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
});
