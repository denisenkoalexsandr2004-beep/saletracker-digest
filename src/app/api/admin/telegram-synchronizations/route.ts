import { NextResponse } from "next/server";

import { requireAdminApi } from "@/features/admin/admin-auth";
import { TelegramApiError } from "@/features/telegram/telegram.client";
import { pollTelegramUpdatesOnce } from "@/features/telegram/telegram.polling";
import { getTelegramClient } from "@/features/telegram/telegram.runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const unauthorized = requireAdminApi(request);

  if (unauthorized) {
    return unauthorized;
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

  try {
    const result = await pollTelegramUpdatesOnce(client);

    return NextResponse.json({
      data: result,
      message:
        result.mode === "webhook"
          ? "Webhook активен; новые подключения уже поступают автоматически."
          : `Получено обновлений Telegram: ${result.received}.`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        title:
          error instanceof TelegramApiError
            ? "TELEGRAM_UPSTREAM_ERROR"
            : "INTERNAL_ERROR",
        status: 502,
        detail: "Не удалось проверить новые подключения Telegram.",
      },
      { status: 502 },
    );
  }
}
