import { NextResponse } from "next/server";

import { isAdminAuthConfigured } from "@/features/admin/admin-auth";
import { getMaterialRepository } from "@/features/materials/material.repository";
import { getNewsArticleQueueRepository } from "@/features/news-ingestion/news-article-queue.repository";
import { getNewsAiProviderConfiguration } from "@/features/news-ingestion/news-ai-provider";
import { getNewsCandidateRepository } from "@/features/news-ingestion/news-candidate.repository";
import { checkDatabase } from "@/shared/database/client";
import { env } from "@/shared/config/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function isWithinFreshnessWindow(
  value: string | null,
  maxAgeMs: number,
  now: number,
): boolean {
  if (!value) {
    return false;
  }

  const timestamp = Date.parse(value);
  const age = now - timestamp;
  return Number.isFinite(timestamp) && age >= -5 * 60_000 && age <= maxAgeMs;
}

async function getNewsFreshnessCheck(databaseConfigured: boolean) {
  if (!databaseConfigured) {
    return {
      status: "error",
      latestIngestionAt: null,
      latestApprovedSourceAt: null,
      detail: "PostgreSQL is required for persistent freshness checks.",
    };
  }

  try {
    const [runs, approved] = await Promise.all([
      getNewsCandidateRepository().listRuns(1),
      getMaterialRepository().listApproved(),
    ]);
    const latestIngestionAt = runs[0]?.completedAt ?? null;
    const latestApprovedSourceAt =
      approved
        .map((material) => material.sourcePublishedAt)
        .filter((value) => Number.isFinite(Date.parse(value)))
        .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;
    const now = Date.now();
    const ingestionFresh = isWithinFreshnessWindow(
      latestIngestionAt,
      env.NEWS_INGESTION_MAX_AGE_MINUTES * 60_000,
      now,
    );
    const approvedSourceFresh = isWithinFreshnessWindow(
      latestApprovedSourceAt,
      env.NEWS_APPROVED_SOURCE_MAX_AGE_HOURS * 60 * 60_000,
      now,
    );

    return {
      status: ingestionFresh && approvedSourceFresh ? "ok" : "stale",
      latestIngestionAt,
      latestApprovedSourceAt,
      maxIngestionAgeMinutes: env.NEWS_INGESTION_MAX_AGE_MINUTES,
      maxApprovedSourceAgeHours: env.NEWS_APPROVED_SOURCE_MAX_AGE_HOURS,
    };
  } catch {
    return {
      status: "error",
      latestIngestionAt: null,
      latestApprovedSourceAt: null,
      detail: "Could not read news freshness state.",
    };
  }
}

async function getNewsQueueCheck(databaseConfigured: boolean) {
  if (!databaseConfigured) {
    return {
      status: "error",
      detail: "PostgreSQL is required for the persistent news queue.",
    };
  }

  try {
    const stats = await getNewsArticleQueueRepository().getStats();
    return {
      status:
        stats.deadLetter > 0 || stats.retry > 0 ? "degraded" : "ok",
      ...stats,
    };
  } catch {
    return {
      status: "error",
      detail: "Could not read the persistent news queue.",
    };
  }
}

export async function GET() {
  const database = await checkDatabase();
  const newsFreshness = await getNewsFreshnessCheck(
    database.configured && database.status === "ok",
  );
  const newsQueue = await getNewsQueueCheck(
    database.configured && database.status === "ok",
  );
  const appUrlIsHttps = new URL(env.APP_URL).protocol === "https:";
  const telegramConfigured = Boolean(
    env.TELEGRAM_BOT_TOKEN &&
      env.TELEGRAM_BOT_USERNAME &&
      env.TELEGRAM_WEBHOOK_SECRET &&
      env.TELEGRAM_ADMIN_SECRET,
  );
  const dedicatedAdminAuth = Boolean(
    env.ADMIN_PASSWORD && env.SESSION_SECRET,
  );
  const newsProvider = getNewsAiProviderConfiguration();
  const checks = {
    database,
    adminAuth: {
      configured: isAdminAuthConfigured(),
      dedicated: dedicatedAdminAuth,
      status: dedicatedAdminAuth ? "ok" : "error",
    },
    appUrl: {
      configured: appUrlIsHttps,
      status: appUrlIsHttps ? "ok" : "error",
    },
    telegram: {
      configured: telegramConfigured,
      status: telegramConfigured ? "ok" : "error",
    },
    scheduler: {
      configured: Boolean(env.CRON_SECRET),
      status: env.CRON_SECRET ? "ok" : "error",
    },
    newsAgent: {
      provider: newsProvider.provider,
      model: newsProvider.model,
      credentialName: newsProvider.credentialName,
      configured: newsProvider.configured,
      status: newsProvider.configured ? "ok" : "error",
    },
    newsQueue,
    newsFreshness,
  };
  const ready =
    database.configured &&
    database.status === "ok" &&
    checks.adminAuth.dedicated &&
    checks.appUrl.configured &&
    checks.telegram.configured &&
    checks.scheduler.configured &&
    checks.newsAgent.configured &&
    checks.newsQueue.status !== "error" &&
    checks.newsFreshness.status === "ok";

  return NextResponse.json(
    {
      status: ready ? "ok" : "degraded",
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: ready ? 200 : 503 },
  );
}
