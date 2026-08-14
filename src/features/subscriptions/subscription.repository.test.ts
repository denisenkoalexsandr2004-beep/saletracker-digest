import { describe, expect, it } from "vitest";

import {
  InMemorySubscriptionRepository,
  type SubscriptionRecord,
} from "@/features/subscriptions/subscription.repository";

function subscription(id: string, token: string): SubscriptionRecord {
  return {
    id,
    connectionToken: token,
    createdAt: "2026-08-13T09:00:00.000Z",
    name: "Александр",
    company: "SaleTracker",
    email: "owner@example.ru",
    role: "supplier",
    tags: ["СТМ"],
    frequency: "daily",
    targetSize: 5,
    consent: true,
  };
}

describe("subscription Telegram rebinding", () => {
  it("переносит чат на новые настройки того же Telegram-пользователя", () => {
    const repository = new InMemorySubscriptionRepository();
    repository.create(subscription("sub_old", "token-old"));
    repository.create(subscription("sub_new", "token-new"));
    const identity = {
      chatId: 9001,
      userId: 7001,
      firstName: "Александр",
    };

    expect(
      repository.connectTelegram(
        "token-old",
        identity,
        "2026-08-13T09:01:00.000Z",
      ).status,
    ).toBe("connected");
    expect(
      repository.connectTelegram(
        "token-new",
        identity,
        "2026-08-13T09:02:00.000Z",
      ).status,
    ).toBe("connected");

    expect(repository.findById("sub_old")?.telegram).toBeUndefined();
    expect(repository.findByTelegramChatId(9001)?.id).toBe("sub_new");
  });

  it("не отдаёт существующий чат другому Telegram-пользователю", () => {
    const repository = new InMemorySubscriptionRepository();
    repository.create(subscription("sub_old", "token-old"));
    repository.create(subscription("sub_new", "token-new"));
    repository.connectTelegram(
      "token-old",
      { chatId: 9001, userId: 7001, firstName: "Александр" },
      "2026-08-13T09:01:00.000Z",
    );

    const result = repository.connectTelegram(
      "token-new",
      { chatId: 9001, userId: 7999, firstName: "Чужой пользователь" },
      "2026-08-13T09:02:00.000Z",
    );

    expect(result.status).toBe("conflict");
    expect(repository.findByTelegramChatId(9001)?.id).toBe("sub_old");
  });
});
