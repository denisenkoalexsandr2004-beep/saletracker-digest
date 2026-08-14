import { pollTelegramUpdatesOnce } from "@/features/telegram/telegram.polling";
import { getTelegramClient } from "@/features/telegram/telegram.runtime";

const LONG_POLL_TIMEOUT_SECONDS = 25;
const POLLING_RETRY_DELAY_MS = 1_000;

interface TelegramPollingLoopState {
  running: boolean;
  mode: "polling" | "webhook" | "disabled";
  lastRunAt?: string;
  lastError?: string;
}

declare global {
  var saleTrackerTelegramPollingLoopState:
    | TelegramPollingLoopState
    | undefined;
}

function scheduleNext(run: () => Promise<void>, delayMs: number) {
  const timer = setTimeout(() => void run(), delayMs);
  timer.unref();
}

export function getTelegramPollingLoopState(): TelegramPollingLoopState {
  return (
    globalThis.saleTrackerTelegramPollingLoopState ?? {
      running: false,
      mode: "disabled",
    }
  );
}

export function startTelegramPollingLoop(): void {
  if (globalThis.saleTrackerTelegramPollingLoopState?.running) {
    return;
  }

  const client = getTelegramClient();

  if (!client) {
    globalThis.saleTrackerTelegramPollingLoopState = {
      running: false,
      mode: "disabled",
    };
    return;
  }

  globalThis.saleTrackerTelegramPollingLoopState = {
    running: true,
    mode: "polling",
  };

  const run = async () => {
    let nextDelayMs = 0;

    try {
      const result = await pollTelegramUpdatesOnce(client, {
        timeoutSeconds: LONG_POLL_TIMEOUT_SECONDS,
      });
      globalThis.saleTrackerTelegramPollingLoopState = {
        running: result.mode === "polling",
        mode: result.mode,
        lastRunAt: new Date().toISOString(),
      };

      if (result.mode === "webhook") {
        return;
      }
    } catch (error) {
      nextDelayMs = POLLING_RETRY_DELAY_MS;
      globalThis.saleTrackerTelegramPollingLoopState = {
        running: true,
        mode: "polling",
        lastRunAt: new Date().toISOString(),
        lastError: error instanceof Error ? error.name : "UNKNOWN_ERROR",
      };
    }

    scheduleNext(run, nextDelayMs);
  };

  void run();
}
