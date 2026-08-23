import { describe, expect, it } from "vitest";

import { InMemoryDigestDeliveryRepository } from "@/features/deliveries/digest-delivery.repository";
import {
  getDigestDispatchRunKey,
  getMoscowSlot,
  getDigestCutoff,
  isDigestDispatchWindow,
  isDigestDue,
  runScheduledDigestDispatch,
} from "@/features/jobs/digest-schedule.service";
import { InMemorySubscriptionRepository } from "@/features/subscriptions/subscription.repository";
import type { TelegramGateway } from "@/features/telegram/telegram.types";
import { demoEvents, demoMaterials } from "@/shared/demo-data";

class FakeGateway implements TelegramGateway {
  readonly messages: string[] = [];

  async sendMessage(_chatId: number, text: string) {
    this.messages.push(text);
  }
}

class RecoveringGateway implements TelegramGateway {
  shouldFail = true;
  readonly messages: string[] = [];

  async sendMessage(_chatId: number, text: string) {
    if (this.shouldFail) {
      throw new Error("Telegram temporarily unavailable");
    }

    this.messages.push(text);
  }
}

describe("digest schedule", () => {
  it("вычисляет дни отправки в часовом поясе Москвы", () => {
    const firstMonday = getMoscowSlot("2026-08-03T09:00:00.000Z");
    const thursday = getMoscowSlot("2026-08-06T09:00:00.000Z");

    expect(firstMonday.date).toBe("2026-08-03");
    expect(isDigestDue("daily", firstMonday)).toBe(true);
    expect(isDigestDue("twice-weekly", firstMonday)).toBe(true);
    expect(isDigestDue("weekly", firstMonday)).toBe(true);
    expect(isDigestDue("monthly", firstMonday)).toBe(true);
    expect(isDigestDue("twice-weekly", thursday)).toBe(true);
    expect(isDigestDue("weekly", thursday)).toBe(false);
    expect(getDigestCutoff(firstMonday)).toBe("2026-08-03T08:30:00.000Z");
    expect(getDigestDispatchRunKey(firstMonday)).toBe(
      "digest-dispatch:2026-08-03:12:00",
    );
    expect(isDigestDispatchWindow(firstMonday)).toBe(true);
    expect(
      isDigestDispatchWindow(getMoscowSlot("2026-08-03T11:59:00.000Z")),
    ).toBe(true);
    expect(
      isDigestDispatchWindow(getMoscowSlot("2026-08-03T12:00:00.000Z")),
    ).toBe(false);
  });

  it("не создаёт повторную отправку для того же временного слота", async () => {
    const subscriptions = new InMemorySubscriptionRepository();
    const deliveries = new InMemoryDigestDeliveryRepository();
    const gateway = new FakeGateway();
    subscriptions.create({
      id: "sub_schedule",
      connectionToken: "schedule-token",
      createdAt: "2026-07-14T09:00:00.000Z",
      name: "Анна",
      company: "Тестовая сеть",
      email: "buyer@example.ru",
      role: "buyer",
      tags: ["Молочная продукция", "СТМ", "Логистика"],
      frequency: "weekly",
      targetSize: 10,
      consent: true,
      telegram: {
        chatId: 9001,
        userId: 7001,
        firstName: "Анна",
        connectedAt: "2026-07-14T09:10:00.000Z",
      },
    });
    const now = "2026-07-27T09:00:00.000Z";
    const dependencies = {
      gateway,
      appUrl: "https://digest.example.ru",
      subscriptions,
      deliveries,
      materials: demoMaterials,
      events: demoEvents,
    };

    const first = await runScheduledDigestDispatch(now, dependencies);
    const messageCount = gateway.messages.length;
    const repeated = await runScheduledDigestDispatch(now, dependencies);

    expect(first.sent).toBe(1);
    expect(repeated.alreadySent).toBe(1);
    expect(gateway.messages).toHaveLength(messageCount);
  });

  it("сигнализирует о частичном сбое и успешно повторяет failed-выпуск", async () => {
    const subscriptions = new InMemorySubscriptionRepository();
    const deliveries = new InMemoryDigestDeliveryRepository();
    const gateway = new RecoveringGateway();
    subscriptions.create({
      id: "sub_retry",
      connectionToken: "retry-token",
      createdAt: "2026-07-14T09:00:00.000Z",
      name: "Ирина",
      company: "Тестовый поставщик",
      email: "retry@example.ru",
      role: "supplier",
      tags: ["Молочная продукция", "СТМ", "Логистика"],
      frequency: "weekly",
      targetSize: 10,
      consent: true,
      telegram: {
        chatId: 9002,
        userId: 7002,
        firstName: "Ирина",
        connectedAt: "2026-07-14T09:10:00.000Z",
      },
    });
    const dependencies = {
      gateway,
      appUrl: "https://digest.example.ru",
      subscriptions,
      deliveries,
      materials: demoMaterials,
      events: demoEvents,
    };
    const now = "2026-07-27T09:00:00.000Z";

    await expect(
      runScheduledDigestDispatch(now, dependencies),
    ).rejects.toMatchObject({
      name: "ScheduledDigestDispatchError",
      summary: { failed: [{ subscriptionId: "sub_retry" }] },
    });

    gateway.shouldFail = false;
    const retried = await runScheduledDigestDispatch(now, dependencies);

    expect(retried.sent).toBe(1);
    expect(retried.failed).toHaveLength(0);
    expect(deliveries.findBySubscriptionId("sub_retry")?.status).toBe("sent");
  });

  it("не включает материал, утверждённый после cutoff 11:30 МСК", async () => {
    const subscriptions = new InMemorySubscriptionRepository();
    const deliveries = new InMemoryDigestDeliveryRepository();
    const gateway = new FakeGateway();
    subscriptions.create({
      id: "sub_cutoff",
      connectionToken: "cutoff-token",
      createdAt: "2026-07-27T07:00:00.000Z",
      name: "Анна",
      company: "Тестовая сеть",
      email: "cutoff@example.ru",
      role: "buyer",
      tags: ["Молочная продукция"],
      frequency: "weekly",
      targetSize: 5,
      consent: true,
      telegram: {
        chatId: 9003,
        userId: 7003,
        firstName: "Анна",
        connectedAt: "2026-07-27T07:10:00.000Z",
      },
    });
    const lateMaterial = {
      ...demoMaterials[0],
      id: "late-material",
      storyId: "late-story",
      approvedAt: "2026-07-27T08:45:00.000Z",
    };

    const result = await runScheduledDigestDispatch(
      "2026-07-27T09:00:00.000Z",
      {
        gateway,
        appUrl: "https://digest.example.ru",
        subscriptions,
        deliveries,
        materials: [lateMaterial],
        events: demoEvents,
      },
    );

    expect(result.empty).toBe(1);
    expect(result.sent).toBe(0);
    expect(gateway.messages).toHaveLength(0);
  });

  it("доставляет 100 выпусков короткими пачками без дублей", async () => {
    const subscriptions = new InMemorySubscriptionRepository();
    const deliveries = new InMemoryDigestDeliveryRepository();
    const gateway = new FakeGateway();

    for (let index = 0; index < 100; index += 1) {
      subscriptions.create({
        id: `sub_mass_${index}`,
        connectionToken: `mass-token-${index}`,
        createdAt: "2026-07-14T09:00:00.000Z",
        name: `Получатель ${index}`,
        company: `Компания ${index}`,
        email: `mass-${index}@example.ru`,
        role: "supplier",
        tags: ["Молочная продукция", "СТМ", "Логистика"],
        frequency: "weekly",
        targetSize: 5,
        consent: true,
        telegram: {
          chatId: 10_000 + index,
          userId: 20_000 + index,
          firstName: `Получатель ${index}`,
          connectedAt: "2026-07-14T09:10:00.000Z",
        },
      });
    }

    const dependencies = {
      gateway,
      appUrl: "https://digest.example.ru",
      subscriptions,
      deliveries,
      materials: demoMaterials,
      events: demoEvents,
      batchSize: 5,
    };
    let totalSent = 0;

    for (let invocation = 0; invocation < 20; invocation += 1) {
      const result = await runScheduledDigestDispatch(
        new Date(
          Date.parse("2026-07-27T09:00:00.000Z") +
            invocation * 5 * 60_000,
        ).toISOString(),
        dependencies,
      );
      totalSent += result.sent;
      expect(result.selected).toBe(5);
      expect(result.remaining).toBe(95 - invocation * 5);
    }

    const messageCount = gateway.messages.length;
    const repeated = await runScheduledDigestDispatch(
      "2026-07-27T11:00:00.000Z",
      dependencies,
    );

    expect(totalSent).toBe(100);
    expect(repeated).toMatchObject({
      due: 100,
      selected: 0,
      remaining: 0,
      alreadySent: 100,
    });
    expect(gateway.messages).toHaveLength(messageCount);
  });
});
