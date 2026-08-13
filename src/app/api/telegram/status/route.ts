import { NextResponse } from "next/server";

import { getSubscriptionRepository } from "@/features/subscriptions/subscription.repository";
import { getTelegramPollingLoopState } from "@/features/telegram/telegram.polling-loop";
import { env } from "@/shared/config/env";

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

  return NextResponse.json({
    data: {
      status: credentialsConfigured ? "ready-for-webhook" : "demo",
      botUsername: env.TELEGRAM_BOT_USERNAME ?? null,
      credentialsConfigured,
      storage: "memory",
      subscriptions: stats,
      deliveryListener: polling,
    },
  });
}
