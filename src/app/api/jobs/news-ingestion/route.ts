import { NextResponse } from "next/server";

import { requireCronRequest } from "@/features/jobs/cron-auth";
import { runIdempotentJob } from "@/features/jobs/job-run.service";
import { NewsAgentError } from "@/features/news-ingestion/openai-news-agent";
import { runFeedIngestion } from "@/features/news-ingestion/rss-ingestion";
import { isDatabaseConfigured } from "@/shared/database/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const unauthorized = requireCronRequest(request);

  if (unauthorized) {
    return unauthorized;
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      {
        title: "DATABASE_REQUIRED",
        status: 503,
        detail: "Автономный сбор запускается только с PostgreSQL.",
      },
      { status: 503 },
    );
  }

  const now = new Date();
  const hourSlot = now.toISOString().slice(0, 13);

  try {
    const result = await runIdempotentJob({
      kind: "news-ingestion",
      idempotencyKey: `news-ingestion:${hourSlot}`,
      // Разбор идёт по лентам: они отдают все публикации за период, тогда как
      // веб-поиск возвращал выборку и часто вовсе ничего.
      payload: { days: 5, maxCandidates: 12 },
      execute: async () => {
        const ingestion = await runFeedIngestion({ days: 5, maxCandidates: 12 });
        return {
          runId: ingestion.run.id,
          candidateCount: ingestion.candidates.length,
          entriesFound: ingestion.diagnostics.entriesFound,
          entriesQueued: ingestion.diagnostics.entriesQueued,
          entriesProcessed: ingestion.diagnostics.entriesReviewed,
          retryCount: ingestion.diagnostics.retried,
          deadLettersRequeued: ingestion.diagnostics.deadLettersRequeued,
          deadLetterCount: ingestion.diagnostics.queue.deadLetter,
          queuePending: ingestion.diagnostics.queue.pending,
          autoApproved: ingestion.diagnostics.autoApproval.approved,
          autoApprovalFailures:
            ingestion.diagnostics.autoApproval.failed.length,
        };
      },
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    const status = error instanceof NewsAgentError ? error.status : 500;
    return NextResponse.json(
      {
        title:
          error instanceof NewsAgentError ? error.code : "INGESTION_JOB_FAILED",
        status,
        detail:
          error instanceof Error ? error.message : "Автономный сбор не выполнен.",
      },
      { status },
    );
  }
}
