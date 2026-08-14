import { afterEach, describe, expect, it, vi } from "vitest";

import { TelegramClient } from "@/features/telegram/telegram.client";
import { pollTelegramUpdatesOnce } from "@/features/telegram/telegram.polling";

afterEach(() => {
  globalThis.saleTrackerTelegramPollOffset = undefined;
  globalThis.saleTrackerTelegramPollInFlight = undefined;
});

describe("Telegram polling", () => {
  it("uses long polling so a new update is returned without an interval delay", async () => {
    const getUpdates = vi.fn().mockResolvedValue([]);
    const client = {
      getWebhookInfo: vi.fn().mockResolvedValue({ url: "" }),
      getUpdates,
    };

    const result = await pollTelegramUpdatesOnce(client, {
      timeoutSeconds: 25,
    });

    expect(result.mode).toBe("polling");
    expect(getUpdates).toHaveBeenCalledWith(undefined, 25);
  });

  it("does not poll when Telegram already has an active webhook", async () => {
    const getUpdates = vi.fn();
    const client = {
      getWebhookInfo: vi
        .fn()
        .mockResolvedValue({ url: "https://digest.example/api/telegram/webhook" }),
      getUpdates,
    };

    const result = await pollTelegramUpdatesOnce(client);

    expect(result.mode).toBe("webhook");
    expect(getUpdates).not.toHaveBeenCalled();
  });
});

describe("Telegram client", () => {
  it("passes the requested long-poll timeout to the Bot API", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new TelegramClient(
      "123456789:abcdefghijklmnopqrstuvwxyzABCDE",
      fetchImplementation,
    );

    await client.getUpdates(42, 25);

    const [, options] = fetchImplementation.mock.calls[0];
    expect(JSON.parse(String(options?.body))).toMatchObject({
      offset: 42,
      timeout: 25,
      allowed_updates: ["message"],
    });
  });

  it("retries a transient Telegram error without delaying the whole digest job", async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: false,
            error_code: 503,
            description: "Temporary Telegram outage",
          }),
          { status: 503 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, result: true }), {
          status: 200,
        }),
      );
    const waits: number[] = [];
    const client = new TelegramClient(
      "123456789:abcdefghijklmnopqrstuvwxyzABCDE",
      fetchImplementation,
      async (milliseconds) => {
        waits.push(milliseconds);
      },
    );

    await client.setCommands();

    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    expect(waits).toEqual([250]);
  });
});
