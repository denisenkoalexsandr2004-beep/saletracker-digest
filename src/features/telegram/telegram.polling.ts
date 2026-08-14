import type { TelegramClient } from "@/features/telegram/telegram.client";
import { getTelegramUpdateDependencies } from "@/features/telegram/telegram.runtime";
import { handleTelegramUpdate } from "@/features/telegram/telegram.service";

interface TelegramPollingClient {
  getWebhookInfo(): ReturnType<TelegramClient["getWebhookInfo"]>;
  getUpdates(
    offset?: number,
    timeoutSeconds?: number,
  ): ReturnType<TelegramClient["getUpdates"]>;
}

interface TelegramPollingOptions {
  timeoutSeconds?: number;
}

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
  client: TelegramPollingClient,
  options: TelegramPollingOptions,
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
    options.timeoutSeconds ?? 0,
  );
  const results = [];

  if (!updates.length) {
    return {
      mode: "polling",
      received: 0,
      processed: 0,
      duplicates: 0,
      nextOffset: globalThis.saleTrackerTelegramPollOffset ?? null,
    };
  }

  const dependencies = await getTelegramUpdateDependencies(
    client as TelegramClient,
  );

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
  client: TelegramPollingClient,
  options: TelegramPollingOptions = {},
): Promise<TelegramPollingResult> {
  if (globalThis.saleTrackerTelegramPollInFlight) {
    return globalThis.saleTrackerTelegramPollInFlight;
  }

  const polling = performTelegramPoll(client, options).finally(() => {
    if (globalThis.saleTrackerTelegramPollInFlight === polling) {
      globalThis.saleTrackerTelegramPollInFlight = undefined;
    }
  });

  globalThis.saleTrackerTelegramPollInFlight = polling;
  return polling;
}
