import { getDigestDeliveryRepository } from "@/features/deliveries/digest-delivery.repository";
import { getMaterialRepository } from "@/features/materials/material.repository";
import { getSubscriptionRepository } from "@/features/subscriptions/subscription.repository";
import { TelegramClient } from "@/features/telegram/telegram.client";
import type { TelegramUpdateDependencies } from "@/features/telegram/telegram.service";
import { getTelegramUpdateRepository } from "@/features/telegram/telegram-update.repository";
import { env } from "@/shared/config/env";
import { demoEvents } from "@/shared/demo-data";

export function getTelegramClient(): TelegramClient | null {
  return env.TELEGRAM_BOT_TOKEN
    ? new TelegramClient(env.TELEGRAM_BOT_TOKEN)
    : null;
}

export async function getTelegramUpdateDependencies(
  client: TelegramClient,
): Promise<TelegramUpdateDependencies> {
  return {
    gateway: client,
    subscriptions: getSubscriptionRepository(),
    deliveries: getDigestDeliveryRepository(),
    updates: getTelegramUpdateRepository(),
    materials: await getMaterialRepository().listApproved(),
    events: demoEvents,
    appUrl: env.APP_URL,
    now: () => new Date().toISOString(),
  };
}
