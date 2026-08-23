import { describe, expect, it } from "vitest";

import { InMemoryDigestDeliveryRepository } from "@/features/deliveries/digest-delivery.repository";
import {
  DigestDeliveryError,
  createDigestGreeting,
  dispatchDigestDelivery,
  ensureDigestDelivery,
  listDigestDeliveryViews,
  markDigestDeliveryReady,
} from "@/features/deliveries/digest-delivery.service";
import { InMemorySubscriptionRepository } from "@/features/subscriptions/subscription.repository";
import type { SubscriptionRecord } from "@/features/subscriptions/subscription.repository";
import type {
  TelegramGateway,
  TelegramSendOptions,
} from "@/features/telegram/telegram.types";
import { demoEvents, demoMaterials } from "@/shared/demo-data";

const freshDemoMaterials = demoMaterials.map((material, index) => ({
  ...material,
  sourcePublishedAt: `2026-07-${String(23 - (index % 2)).padStart(2, "0")}T09:00:00+03:00`,
}));

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

class FlakyGateway implements TelegramGateway {
  readonly messages: string[] = [];
  private calls = 0;

  async sendMessage(_chatId: number, text: string) {
    this.calls += 1;

    if (this.calls === 2) {
      throw new Error("Temporary Telegram failure");
    }

    this.messages.push(text);
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
      materials: freshDemoMaterials,
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
    expect(fixture.deliveries.list()).toHaveLength(1);
    expect(ready.id).toBe(fixture.delivery.id);
  });

  it("показывает только последний выпуск при исторических дублях", async () => {
    const fixture = await buildFixture();
    const duplicate = fixture.deliveries.create({
      ...fixture.delivery,
      id: "delivery_connected_duplicate",
      issueKey: `${fixture.subscription.id}:connected:legacy`,
      createdAt: "2026-07-24T12:10:00+03:00",
      updatedAt: "2026-07-24T12:10:00+03:00",
    });

    const views = await listDigestDeliveryViews(
      20,
      fixture.subscriptions,
      fixture.deliveries,
    );

    expect(views).toHaveLength(1);
    expect(views[0]?.id).toBe(duplicate.id);
  });

  it("не отправляет устаревшие демоматериалы как свежий выпуск", async () => {
    const subscriptions = new InMemorySubscriptionRepository();
    const deliveries = new InMemoryDigestDeliveryRepository();
    const subscription = subscriptions.create(buildSubscription(false));
    const delivery = await ensureDigestDelivery(
      subscription,
      {
        now: "2026-08-13T12:00:00+03:00",
        materials: demoMaterials,
        events: demoEvents,
      },
      deliveries,
    );

    expect(delivery.issue.items).toHaveLength(0);
  });

  it("пересобирает пустой первый выпуск, когда материалы появились позже", async () => {
    const subscriptions = new InMemorySubscriptionRepository();
    const deliveries = new InMemoryDigestDeliveryRepository();
    const subscription = subscriptions.create(buildSubscription(false));
    const empty = await ensureDigestDelivery(
      subscription,
      {
        now: "2026-07-24T12:00:00+03:00",
        materials: [],
        events: demoEvents,
      },
      deliveries,
    );

    expect(empty.issue.items).toHaveLength(0);

    const rebuilt = await ensureDigestDelivery(
      subscription,
      {
        now: "2026-07-24T13:00:00+03:00",
        materials: freshDemoMaterials,
        events: demoEvents,
      },
      deliveries,
    );

    expect(rebuilt.id).toBe(empty.id);
    expect(rebuilt.issue.items.length).toBeGreaterThan(0);
  });

  it("пересобирает первый выпуск на момент подключения Telegram", async () => {
    const subscriptions = new InMemorySubscriptionRepository();
    const deliveries = new InMemoryDigestDeliveryRepository();
    const subscription = subscriptions.create(buildSubscription(false));
    const initiallyFresh = {
      ...freshDemoMaterials[0],
      id: "initially-fresh",
      storyId: "initially-fresh-story",
      approvedAt: "2026-07-23T09:00:00+03:00",
      sourcePublishedAt: "2026-07-23T08:00:00+03:00",
    };
    await ensureDigestDelivery(
      subscription,
      {
        now: "2026-07-24T12:00:00+03:00",
        materials: [initiallyFresh],
      },
      deliveries,
    );
    const connected = {
      ...subscription,
      telegram: {
        chatId: 9001,
        userId: 7001,
        firstName: "Александр",
        connectedAt: "2026-08-14T12:00:00+03:00",
      },
    };
    const current = {
      ...freshDemoMaterials[0],
      id: "current",
      storyId: "current-story",
      approvedAt: "2026-08-14T08:00:00+03:00",
      sourcePublishedAt: "2026-08-14T07:30:00+03:00",
    };

    const ready = await markDigestDeliveryReady(
      connected,
      "2026-08-14T12:00:00+03:00",
      { materials: [initiallyFresh, current] },
      deliveries,
    );

    expect(ready.issue.items.map((item) => item.id)).toEqual(["current"]);
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
    expect(
      fixture.deliveries.findById(fixture.delivery.id)?.attemptCount,
    ).toBe(1);
  });

  it("при повторе не дублирует уже отправленную часть выпуска", async () => {
    const fixture = await buildFixture();
    const gateway = new FlakyGateway();
    const dependencies = {
      gateway,
      appUrl: "https://digest.example.ru",
      now: () => "2026-07-24T12:01:00+03:00",
      subscriptions: fixture.subscriptions,
      deliveries: fixture.deliveries,
    };

    await expect(
      dispatchDigestDelivery(fixture.delivery.id, dependencies),
    ).rejects.toThrow("Temporary Telegram failure");
    await dispatchDigestDelivery(fixture.delivery.id, dependencies);

    expect(
      gateway.messages.filter((message) =>
        message.includes("Редакция Платформы Сейл Трекер"),
      ),
    ).toHaveLength(1);
    expect(
      fixture.deliveries.findById(fixture.delivery.id)?.attemptCount,
    ).toBe(2);
    expect(
      fixture.deliveries.findById(fixture.delivery.id)?.status,
    ).toBe("sent");
  });

  it("возвращает зависшую отправку в работу после истечения lease", async () => {
    const fixture = await buildFixture();
    const first = fixture.deliveries.claimForSending(
      fixture.delivery.id,
      "2026-07-24T12:01:00+03:00",
    );
    const concurrent = fixture.deliveries.claimForSending(
      fixture.delivery.id,
      "2026-07-24T12:05:00+03:00",
    );
    const reclaimed = fixture.deliveries.claimForSending(
      fixture.delivery.id,
      "2026-07-24T12:17:00+03:00",
    );

    expect(first.status).toBe("claimed");
    expect(concurrent.status).toBe("already-sending");
    expect(reclaimed.status).toBe("claimed");
    expect(
      reclaimed.status === "claimed"
        ? reclaimed.delivery.attemptCount
        : null,
    ).toBe(2);
  });

  it("не переводит уже отправляемый выпуск обратно в ready", async () => {
    const fixture = await buildFixture();
    fixture.deliveries.claimForSending(
      fixture.delivery.id,
      "2026-07-24T12:01:00+03:00",
    );

    const unchanged = fixture.deliveries.markReadyBySubscriptionId(
      fixture.subscription.id,
      "2026-07-24T12:02:00+03:00",
    );

    expect(unchanged?.status).toBe("sending");
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
