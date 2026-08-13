import { pollTelegramUpdatesOnce } from "@/features/telegram/telegram.polling";
import { getTelegramClient } from "@/features/telegram/telegram.runtime";

const POLLING_INTERVAL_MS = 2_500;

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

function scheduleNext(run: () => Promise<void>) {
  const timer = setTimeout(() => void run(), POLLING_INTERVAL_MS);
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
    try {
      const result = await pollTelegramUpdatesOnce(client);
      globalThis.saleTrackerTelegramPollingLoopState = {
        running: result.mode === "polling",
        mode: result.mode,
        lastRunAt: new Date().toISOString(),
      };

      if (result.mode === "webhook") {
        return;
      }
    } catch (error) {
      globalThis.saleTrackerTelegramPollingLoopState = {
        running: true,
        mode: "polling",
        lastRunAt: new Date().toISOString(),
        lastError: error instanceof Error ? error.name : "UNKNOWN_ERROR",
      };
    }

    scheduleNext(run);
  };

  scheduleNext(run);
}
