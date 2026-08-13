import { NextResponse } from "next/server";

import { TelegramApiError } from "@/features/telegram/telegram.client";
import {
  getTelegramClient,
} from "@/features/telegram/telegram.runtime";
import { pollTelegramUpdatesOnce } from "@/features/telegram/telegram.polling";
import {
  getBearerToken,
  secureEquals,
} from "@/features/telegram/telegram.security";
import { env } from "@/shared/config/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (
    !secureEquals(getBearerToken(request), env.TELEGRAM_ADMIN_SECRET)
  ) {
    return NextResponse.json(
      {
        title: "UNAUTHORIZED",
        status: 401,
        detail: "Invalid Telegram administration secret.",
      },
      { status: 401 },
    );
  }

  const client = getTelegramClient();

  if (!client) {
    return NextResponse.json(
      {
        title: "TELEGRAM_NOT_CONFIGURED",
        status: 503,
        detail: "Telegram bot token is not configured.",
      },
      { status: 503 },
    );
  }

  try {
    const result = await pollTelegramUpdatesOnce(client);

    if (result.mode === "webhook") {
      return NextResponse.json(
        {
          title: "WEBHOOK_ALREADY_ACTIVE",
          status: 409,
          detail: "Polling is unavailable while a webhook is active.",
        },
        { status: 409 },
      );
    }

    return NextResponse.json({
      data: result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        title:
          error instanceof TelegramApiError
            ? "TELEGRAM_UPSTREAM_ERROR"
            : "INTERNAL_ERROR",
        status: 502,
        detail: "Could not poll Telegram updates.",
      },
      { status: 502 },
    );
  }
}
