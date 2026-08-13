import { describe, expect, it } from "vitest";

import { InMemoryDigestDeliveryRepository } from "@/features/deliveries/digest-delivery.repository";
import {
  getMoscowSlot,
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
});
