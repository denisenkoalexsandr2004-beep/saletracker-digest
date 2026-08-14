import { NextResponse } from "next/server";

import { TelegramApiError } from "@/features/telegram/telegram.client";
import {
  getTelegramClient,
  getTelegramUpdateDependencies,
} from "@/features/telegram/telegram.runtime";
import { telegramUpdateSchema } from "@/features/telegram/telegram.schema";
import { secureEquals } from "@/features/telegram/telegram.security";
import { handleTelegramUpdate } from "@/features/telegram/telegram.service";
import { env } from "@/shared/config/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const client = getTelegramClient();

  if (!client || !env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json(
      {
        title: "TELEGRAM_NOT_CONFIGURED",
        status: 503,
        detail: "Telegram integration is not configured.",
      },
      { status: 503 },
    );
  }

  const authorized = secureEquals(
    request.headers.get("x-telegram-bot-api-secret-token"),
    env.TELEGRAM_WEBHOOK_SECRET,
  );

  if (!authorized) {
    return NextResponse.json(
      {
        title: "UNAUTHORIZED",
        status: 401,
        detail: "Invalid Telegram webhook secret.",
      },
      { status: 401 },
    );
  }

  const payload: unknown = await request.json().catch(() => null);
  const parsed = telegramUpdateSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      {
        title: "INVALID_TELEGRAM_UPDATE",
        status: 422,
        detail: "Telegram update does not match the expected schema.",
      },
      { status: 422 },
    );
  }

  try {
    const status = await handleTelegramUpdate(
      parsed.data,
      await getTelegramUpdateDependencies(client),
    );

    return NextResponse.json({ data: { status } });
  } catch (error) {
    const upstream = error instanceof TelegramApiError;

    return NextResponse.json(
      {
        title: upstream ? "TELEGRAM_UPSTREAM_ERROR" : "INTERNAL_ERROR",
        status: upstream ? 502 : 500,
        detail: upstream
          ? "Telegram Bot API did not accept the request."
          : "Could not process Telegram update.",
      },
      { status: upstream ? 502 : 500 },
    );
  }
}
