import { describe, expect, it } from "vitest";

import { InMemoryDigestDeliveryRepository } from "@/features/deliveries/digest-delivery.repository";
import { InMemorySubscriptionRepository } from "@/features/subscriptions/subscription.repository";
import type { SubscriptionRecord } from "@/features/subscriptions/subscription.repository";
import { handleTelegramUpdate } from "@/features/telegram/telegram.service";
import type {
  TelegramGateway,
  TelegramSendOptions,
  TelegramUpdate,
} from "@/features/telegram/telegram.types";
import { InMemoryTelegramUpdateRepository } from "@/features/telegram/telegram-update.repository";
import { demoEvents, demoMaterials } from "@/shared/demo-data";

class FakeGateway implements TelegramGateway {
  readonly messages: {
    chatId: number;
    text: string;
    options?: TelegramSendOptions;
  }[] = [];

  async sendMessage(
    chatId: number,
    text: string,
    options?: TelegramSendOptions,
  ) {
    this.messages.push({ chatId, text, options });
  }
}

class FailingOnceGateway implements TelegramGateway {
  private failed = false;
  readonly messages: string[] = [];

  async sendMessage(_chatId: number, text: string) {
    if (!this.failed) {
      this.failed = true;
      throw new Error("Temporary Telegram failure");
    }

    this.messages.push(text);
  }
}

function buildSubscription(): SubscriptionRecord {
  return {
    id: "sub_test",
    connectionToken: "pilot-token",
    createdAt: "2026-07-24T10:00:00+03:00",
    name: "Александр",
    company: "Пилот <ЦЗС>",
    email: "pilot@example.ru",
    role: "supplier",
    tags: ["Молочная продукция", "СТМ", "Логистика"],
    frequency: "twice-weekly",
    targetSize: 10,
    consent: true,
  };
}

function buildUpdate(updateId: number, text: string): TelegramUpdate {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      chat: { id: 9001, type: "private" },
      from: {
        id: 7001,
        is_bot: false,
        first_name: "Александр",
        username: "pilot_user",
      },
      date: 1_790_000_000,
      text,
    },
  };
}

function buildFixture() {
  const gateway = new FakeGateway();
  const deliveries = new InMemoryDigestDeliveryRepository();
  const subscriptions = new InMemorySubscriptionRepository();
  const updates = new InMemoryTelegramUpdateRepository();
  subscriptions.create(buildSubscription());

  return {
    gateway,
    deliveries,
    subscriptions,
    updates,
    dependencies: {
      gateway,
      deliveries,
      subscriptions,
      updates,
      materials: demoMaterials,
      events: demoEvents,
      appUrl: "https://digest.example.ru",
      now: () => "2026-07-24T12:00:00+03:00",
    },
  };
}

describe("handleTelegramUpdate", () => {
  it("привязывает чат и сразу отправляет первый выпуск", async () => {
    const fixture = buildFixture();
    const result = await handleTelegramUpdate(
      buildUpdate(1, "/start pilot-token"),
      fixture.dependencies,
    );

    expect(result).toBe("processed");
    expect(
      fixture.subscriptions.findByTelegramChatId(9001)?.telegram?.username,
    ).toBe("pilot_user");
    expect(fixture.gateway.messages.length).toBeGreaterThan(2);
    expect(fixture.gateway.messages[0].text).toContain(
      "Компания: Пилот &lt;ЦЗС&gt;",
    );
    expect(
      fixture.gateway.messages.some((message) =>
        message.text.includes("Подробнее:"),
      ),
    ).toBe(true);
    expect(
      fixture.deliveries.findBySubscriptionId("sub_test")?.status,
    ).toBe("sent");
  });

  it("не обрабатывает повторный update второй раз", async () => {
    const fixture = buildFixture();
    const update = buildUpdate(2, "/start pilot-token");

    await handleTelegramUpdate(update, fixture.dependencies);
    const messageCount = fixture.gateway.messages.length;
    const result = await handleTelegramUpdate(update, fixture.dependencies);

    expect(result).toBe("duplicate");
    expect(fixture.gateway.messages).toHaveLength(messageCount);
  });

  it("отклоняет неизвестный токен подключения", async () => {
    const fixture = buildFixture();

    await handleTelegramUpdate(
      buildUpdate(3, "/start wrong-token"),
      fixture.dependencies,
    );

    expect(fixture.gateway.messages).toHaveLength(1);
    expect(fixture.gateway.messages[0].text).toContain("недействительна");
    expect(fixture.subscriptions.findByTelegramChatId(9001)).toBeNull();
  });

  it("просит подключить подписку перед командой digest", async () => {
    const fixture = buildFixture();

    await handleTelegramUpdate(
      buildUpdate(4, "/digest"),
      fixture.dependencies,
    );

    expect(fixture.gateway.messages[0].text).toContain("Сначала подключите");
  });

  it("освобождает update claim после ошибки для безопасного повтора", async () => {
    const fixture = buildFixture();
    const gateway = new FailingOnceGateway();
    const dependencies = { ...fixture.dependencies, gateway };
    const update = buildUpdate(5, "/help");

    await expect(
      handleTelegramUpdate(update, dependencies),
    ).rejects.toThrow("Temporary Telegram failure");
    const repeated = await handleTelegramUpdate(update, dependencies);

    expect(repeated).toBe("processed");
    expect(gateway.messages).toHaveLength(1);
  });
});
