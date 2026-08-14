import { NextResponse } from "next/server";

import { getSubscriptionRepository } from "@/features/subscriptions/subscription.repository";
import { getTelegramPollingLoopState } from "@/features/telegram/telegram.polling-loop";
import { env } from "@/shared/config/env";
import { isDatabaseConfigured } from "@/shared/database/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const stats = await getSubscriptionRepository().getStats();
  const polling = getTelegramPollingLoopState();
  const credentialsConfigured = Boolean(
    env.TELEGRAM_BOT_TOKEN &&
      env.TELEGRAM_BOT_USERNAME &&
      env.TELEGRAM_WEBHOOK_SECRET &&
      env.TELEGRAM_ADMIN_SECRET,
  );
  const publicHttpsConfigured =
    new URL(env.APP_URL).protocol === "https:";
  const status = !credentialsConfigured
    ? "demo"
    : publicHttpsConfigured
      ? "ready-for-webhook"
      : "ready-for-polling";

  return NextResponse.json({
    data: {
      status,
      botUsername: env.TELEGRAM_BOT_USERNAME ?? null,
      credentialsConfigured,
      publicHttpsConfigured,
      storage: isDatabaseConfigured() ? "postgresql" : "memory",
      subscriptions: stats,
      deliveryListener: polling,
    },
  });
}
