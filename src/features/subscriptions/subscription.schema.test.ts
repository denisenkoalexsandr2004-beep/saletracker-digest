import { describe, expect, it } from "vitest";

import { subscriptionSchema } from "@/features/subscriptions/subscription.schema";

const validSubscription = {
  name: "Александр",
  company: "Тестовая компания",
  email: "demo@example.ru",
  role: "supplier",
  tags: ["Молочная продукция", "СТМ"],
  frequency: "weekly",
  targetSize: 10,
  consent: true,
};

describe("subscriptionSchema", () => {
  it("принимает бесплатные настройки без тарифа", () => {
    const result = subscriptionSchema.safeParse(validSubscription);

    expect(result.success).toBe(true);
  });

  it("разрешает ежедневную отправку", () => {
    const result = subscriptionSchema.safeParse({
      ...validSubscription,
      frequency: "daily",
      targetSize: 5,
    });

    expect(result.success).toBe(true);
  });

  it("принимает объёмы 5, 10 и 15", () => {
    const results = [5, 10, 15].map((targetSize) =>
      subscriptionSchema.safeParse({
        ...validSubscription,
        targetSize,
      }),
    );

    expect(results.every((result) => result.success)).toBe(true);
  });

  it("не принимает старые объёмы", () => {
    const result = subscriptionSchema.safeParse({
      ...validSubscription,
      targetSize: 13,
    });

    expect(result.success).toBe(false);
    expect(
      result.error?.issues.some((issue) => issue.path[0] === "targetSize"),
    ).toBe(true);
  });

  it("отклоняет тему вне утверждённого каталога", () => {
    const result = subscriptionSchema.safeParse({
      ...validSubscription,
      tags: ["Секретная произвольная тема"],
    });

    expect(result.success).toBe(false);
  });
});
