import type { TelegramClient } from "@/features/telegram/telegram.client";
import { getTelegramUpdateDependencies } from "@/features/telegram/telegram.runtime";
import { handleTelegramUpdate } from "@/features/telegram/telegram.service";

export interface TelegramPollingResult {
  mode: "polling" | "webhook";
  received: number;
  processed: number;
  duplicates: number;
  nextOffset: number | null;
}

declare global {
  var saleTrackerTelegramPollOffset: number | undefined;
  var saleTrackerTelegramPollInFlight:
    | Promise<TelegramPollingResult>
    | undefined;
}

async function performTelegramPoll(
  client: TelegramClient,
): Promise<TelegramPollingResult> {
  const webhook = await client.getWebhookInfo();

  if (webhook.url) {
    return {
      mode: "webhook",
      received: 0,
      processed: 0,
      duplicates: 0,
      nextOffset: globalThis.saleTrackerTelegramPollOffset ?? null,
    };
  }

  const updates = await client.getUpdates(
    globalThis.saleTrackerTelegramPollOffset,
  );
  const dependencies = getTelegramUpdateDependencies(client);
  const results = [];

  for (const update of updates) {
    results.push(await handleTelegramUpdate(update, dependencies));
    globalThis.saleTrackerTelegramPollOffset = update.update_id + 1;
  }

  return {
    mode: "polling",
    received: updates.length,
    processed: results.filter((result) => result === "processed").length,
    duplicates: results.filter((result) => result === "duplicate").length,
    nextOffset: globalThis.saleTrackerTelegramPollOffset ?? null,
  };
}

export function pollTelegramUpdatesOnce(
  client: TelegramClient,
): Promise<TelegramPollingResult> {
  if (globalThis.saleTrackerTelegramPollInFlight) {
    return globalThis.saleTrackerTelegramPollInFlight;
  }

  const polling = performTelegramPoll(client).finally(() => {
    if (globalThis.saleTrackerTelegramPollInFlight === polling) {
      globalThis.saleTrackerTelegramPollInFlight = undefined;
    }
  });

  globalThis.saleTrackerTelegramPollInFlight = polling;
  return polling;
}
