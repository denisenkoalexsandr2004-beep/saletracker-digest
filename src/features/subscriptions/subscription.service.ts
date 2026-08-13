import { randomUUID } from "node:crypto";

import type { SubscriptionInput } from "./subscription.schema";
import {
  getSubscriptionRepository,
  type SubscriptionRepository,
} from "./subscription.repository";

export interface CreatedSubscription {
  id: string;
  connectionToken: string;
  integrationMode: "telegram" | "demo";
  nextStepUrl: string;
}

interface CreateSubscriptionOptions {
  appUrl: string;
  telegramBotUsername?: string;
}

export async function createSubscription(
  input: SubscriptionInput,
  options: CreateSubscriptionOptions,
  repository: SubscriptionRepository = getSubscriptionRepository(),
): Promise<CreatedSubscription> {
  const id = `sub_${randomUUID()}`;
  const connectionToken = randomUUID();

  await repository.create({
    ...input,
    id,
    connectionToken,
    createdAt: new Date().toISOString(),
  });

  if (options.telegramBotUsername) {
    return {
      id,
      connectionToken,
      integrationMode: "telegram",
      nextStepUrl: `https://t.me/${options.telegramBotUsername}?start=${connectionToken}`,
    };
  }

  return {
    id,
    connectionToken,
    integrationMode: "demo",
    nextStepUrl: `${options.appUrl}/preview?token=${connectionToken}`,
  };
}
