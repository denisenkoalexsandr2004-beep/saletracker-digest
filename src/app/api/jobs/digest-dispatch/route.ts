import { NextResponse } from "next/server";

import { requireCronRequest } from "@/features/jobs/cron-auth";
import {
  getMoscowSlot,
  runScheduledDigestDispatch,
} from "@/features/jobs/digest-schedule.service";
import { runIdempotentJob } from "@/features/jobs/job-run.service";
import { getMaterialRepository } from "@/features/materials/material.repository";
import { getTelegramClient } from "@/features/telegram/telegram.runtime";
import { env } from "@/shared/config/env";
import { isDatabaseConfigured } from "@/shared/database/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
        detail: "Регулярная отправка запускается только с PostgreSQL.",
      },
      { status: 503 },
    );
  }

  const client = getTelegramClient();

  if (!client) {
    return NextResponse.json(
      {
        title: "TELEGRAM_NOT_CONFIGURED",
        status: 503,
        detail: "Telegram-бот не настроен на сервере.",
      },
      { status: 503 },
    );
  }

  const now = new Date().toISOString();
  const slot = getMoscowSlot(now);

  if (slot.hour !== 12) {
    return NextResponse.json(
      {
        data: { skipped: true, reason: "outside-dispatch-hour", slot },
      },
      { status: 202 },
    );
  }

  const result = await runIdempotentJob({
    kind: "digest-dispatch",
    idempotencyKey: `digest-dispatch:${slot.date}`,
    payload: { slot: slot.date, timezone: "Europe/Moscow" },
    execute: async () =>
      runScheduledDigestDispatch(now, {
        gateway: client,
        appUrl: env.NEXT_PUBLIC_APP_URL,
        materials: await getMaterialRepository().listApproved(),
      }),
  });

  return NextResponse.json({ data: result });
}
