import { NextResponse } from "next/server";

import { requireCronRequest } from "@/features/jobs/cron-auth";
import {
  getDigestDispatchRunKey,
  getMoscowSlot,
  isDigestDispatchWindow,
  runScheduledDigestDispatch,
  ScheduledDigestDispatchError,
} from "@/features/jobs/digest-schedule.service";
import { runIdempotentJob } from "@/features/jobs/job-run.service";
import { getMaterialRepository } from "@/features/materials/material.repository";
import { getTelegramClient } from "@/features/telegram/telegram.runtime";
import { env } from "@/shared/config/env";
import { isDatabaseConfigured } from "@/shared/database/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

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

  if (!isDigestDispatchWindow(slot)) {
    return NextResponse.json(
      {
        data: { skipped: true, reason: "outside-dispatch-window", slot },
      },
      { status: 202 },
    );
  }

  try {
    const result = await runIdempotentJob({
      kind: "digest-dispatch",
      idempotencyKey: getDigestDispatchRunKey(slot),
      payload: {
        slot: slot.date,
        hour: slot.hour,
        minute: slot.minute,
        timezone: "Europe/Moscow",
      },
      execute: async () =>
        runScheduledDigestDispatch(now, {
          gateway: client,
          appUrl: env.APP_URL,
          batchSize: env.DIGEST_DISPATCH_BATCH_SIZE,
          materials: await getMaterialRepository().listApproved(),
        }),
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    if (error instanceof ScheduledDigestDispatchError) {
      return NextResponse.json(
        {
          title: "DISPATCH_PARTIAL_FAILURE",
          status: 502,
          detail: error.message,
          data: error.summary,
        },
        { status: 502 },
      );
    }

    return NextResponse.json(
      {
        title: "INTERNAL_ERROR",
        status: 500,
        detail: "Не удалось выполнить плановую рассылку.",
      },
      { status: 500 },
    );
  }
}
