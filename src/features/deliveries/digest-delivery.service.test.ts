import { describe, expect, it } from "vitest";

import { InMemoryDigestDeliveryRepository } from "@/features/deliveries/digest-delivery.repository";
import {
  DigestDeliveryError,
  createDigestGreeting,
  dispatchDigestDelivery,
  ensureDigestDelivery,
  markDigestDeliveryReady,
} from "@/features/deliveries/digest-delivery.service";
import { InMemorySubscriptionRepository } from "@/features/subscriptions/subscription.repository";
import type { SubscriptionRecord } from "@/features/subscriptions/subscription.repository";
import type {
  TelegramGateway,
  TelegramSendOptions,
} from "@/features/telegram/telegram.types";
import { demoEvents, demoMaterials } from "@/shared/demo-data";

class FakeGateway implements TelegramGateway {
  readonly messages: {
    chatId: number;
    text: string;
    options?: TelegramSendOptions;
  }[] = [];

  constructor(private readonly shouldFail = false) {}

  async sendMessage(
    chatId: number,
    text: string,
    options?: TelegramSendOptions,
  ) {
    if (this.shouldFail) {
      throw new Error("Telegram unavailable");
    }

    this.messages.push({ chatId, text, options });
  }
}

function buildSubscription(connected = true): SubscriptionRecord {
  return {
    id: "sub_delivery_test",
    connectionToken: "delivery-token",
    createdAt: "2026-07-24T10:00:00+03:00",
    name: "Александр Петров",
    company: "Пилот ЦЗС",
    email: "pilot@example.ru",
    role: "supplier",
    tags: ["Молочная продукция", "СТМ", "Логистика"],
    frequency: "twice-weekly",
    targetSize: 10,
    consent: true,
    telegram: connected
      ? {
          chatId: 9001,
          userId: 7001,
          username: "pilot_user",
          firstName: "Александр",
          connectedAt: "2026-07-24T11:55:00+03:00",
        }
      : undefined,
  };
}

async function buildFixture(connected = true) {
  const subscriptions = new InMemorySubscriptionRepository();
  const deliveries = new InMemoryDigestDeliveryRepository();
  const subscription = subscriptions.create(buildSubscription(connected));
  const delivery = await ensureDigestDelivery(
    subscription,
    {
      now: "2026-07-24T12:00:00+03:00",
      materials: demoMaterials,
      events: demoEvents,
    },
    deliveries,
  );

  return { subscriptions, deliveries, subscription, delivery };
}

describe("digest delivery", () => {
  it("создаёт ожидающий выпуск и переводит его в ready после Telegram", async () => {
    const fixture = await buildFixture(false);

    expect(fixture.delivery.status).toBe("waiting-telegram");

    const connected = {
      ...fixture.subscription,
      telegram: {
        chatId: 9001,
        userId: 7001,
        username: "pilot_user",
        firstName: "Александр",
        connectedAt: "2026-07-24T11:55:00+03:00",
      },
    };
    const ready = await markDigestDeliveryReady(
      connected,
      "2026-07-24T11:55:00+03:00",
      {},
      fixture.deliveries,
    );

    expect(ready.status).toBe("ready");
  });

  it("отправляет приветствие, выпуск и фиксирует результат", async () => {
    const fixture = await buildFixture();
    const gateway = new FakeGateway();
    let call = 0;
    const times = [
      "2026-07-24T12:01:00+03:00",
      "2026-07-24T12:01:04+03:00",
    ];

    const result = await dispatchDigestDelivery(fixture.delivery.id, {
      gateway,
      appUrl: "https://digest.example.ru",
      now: () => times[Math.min(call++, times.length - 1)],
      subscriptions: fixture.subscriptions,
      deliveries: fixture.deliveries,
    });

    expect(result.alreadySent).toBe(false);
    expect(result.delivery.status).toBe("sent");
    expect(gateway.messages[0].text).toContain("24 июля 2026");
    expect(gateway.messages[0].text).toContain("Александр");
    expect(
      gateway.messages.some((message) =>
        message.text.includes("Подробнее:"),
      ),
    ).toBe(true);
  });

  it("не отправляет выпуск повторно после успешной отправки", async () => {
    const fixture = await buildFixture();
    const gateway = new FakeGateway();
    const dependencies = {
      gateway,
      appUrl: "https://digest.example.ru",
      now: () => "2026-07-24T12:01:00+03:00",
      subscriptions: fixture.subscriptions,
      deliveries: fixture.deliveries,
    };

    await dispatchDigestDelivery(fixture.delivery.id, dependencies);
    const messageCount = gateway.messages.length;
    const repeated = await dispatchDigestDelivery(
      fixture.delivery.id,
      dependencies,
    );

    expect(repeated.alreadySent).toBe(true);
    expect(gateway.messages).toHaveLength(messageCount);
  });

  it("сохраняет ошибку Telegram и разрешает повторную попытку", async () => {
    const fixture = await buildFixture();

    await expect(
      dispatchDigestDelivery(fixture.delivery.id, {
        gateway: new FakeGateway(true),
        appUrl: "https://digest.example.ru",
        now: () => "2026-07-24T12:01:00+03:00",
        subscriptions: fixture.subscriptions,
        deliveries: fixture.deliveries,
      }),
    ).rejects.toThrow("Telegram unavailable");

    expect(
      fixture.deliveries.findById(fixture.delivery.id)?.status,
    ).toBe("failed");
  });

  it("не отправляет выпуск до подключения Telegram", async () => {
    const fixture = await buildFixture(false);

    await expect(
      dispatchDigestDelivery(fixture.delivery.id, {
        gateway: new FakeGateway(),
        appUrl: "https://digest.example.ru",
        now: () => "2026-07-24T12:01:00+03:00",
        subscriptions: fixture.subscriptions,
        deliveries: fixture.deliveries,
      }),
    ).rejects.toMatchObject({
      code: "TELEGRAM_NOT_CONNECTED",
    } satisfies Partial<DigestDeliveryError>);
  });

  it("формирует деловое приветствие с датой и составом выпуска", async () => {
    const fixture = await buildFixture();
    const greeting = createDigestGreeting(
      fixture.delivery.issue,
      fixture.subscription.name,
    );

    expect(greeting).toContain("Добрый день, Александр");
    expect(greeting).toContain("24 июля 2026");
    expect(greeting).toContain("8 по выбранным интересам");
  });
});
