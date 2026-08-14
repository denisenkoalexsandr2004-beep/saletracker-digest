import { NextResponse } from "next/server";

import { TelegramApiError } from "@/features/telegram/telegram.client";
import { getTelegramClient } from "@/features/telegram/telegram.runtime";
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

  if (
    !client ||
    !env.TELEGRAM_BOT_USERNAME ||
    !env.TELEGRAM_WEBHOOK_SECRET
  ) {
    return NextResponse.json(
      {
        title: "TELEGRAM_NOT_CONFIGURED",
        status: 503,
        detail: "Telegram environment variables are incomplete.",
      },
      { status: 503 },
    );
  }

  const appUrl = new URL(env.APP_URL);

  try {
    const bot = await client.getMe();

    if (
      bot.username.toLowerCase() !==
      env.TELEGRAM_BOT_USERNAME.toLowerCase()
    ) {
      return NextResponse.json(
        {
          title: "BOT_USERNAME_MISMATCH",
          status: 409,
          detail: "Configured username does not match the Telegram bot token.",
        },
        { status: 409 },
      );
    }

    await client.setCommands();

    if (appUrl.protocol !== "https:") {
      return NextResponse.json({
        data: {
          botId: bot.id,
          botUsername: bot.username,
          webhookUrl: null,
          commandsConfigured: true,
          webhookConfigured: false,
        },
        message:
          "Команды обновлены. Для webhook потребуется публичный HTTPS-адрес.",
      });
    }

    const webhookUrl = new URL(
      "/api/telegram/webhook",
      env.APP_URL,
    ).toString();

    await client.setWebhook(webhookUrl, env.TELEGRAM_WEBHOOK_SECRET);

    return NextResponse.json({
      data: {
        botId: bot.id,
        botUsername: bot.username,
        webhookUrl,
        commandsConfigured: true,
        webhookConfigured: true,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        title:
          error instanceof TelegramApiError
            ? "TELEGRAM_UPSTREAM_ERROR"
            : "INTERNAL_ERROR",
        status: 502,
        detail: "Could not configure the Telegram bot.",
      },
      { status: 502 },
    );
  }
}
