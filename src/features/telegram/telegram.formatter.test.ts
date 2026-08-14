import { describe, expect, it } from "vitest";

import { buildDigestIssue } from "@/features/digests/digest.service";
import {
  createTelegramDeliveryPlan,
  escapeTelegramHtml,
} from "@/features/telegram/telegram.formatter";
import { demoEvents, demoMaterials } from "@/shared/demo-data";

const issue = buildDigestIssue({
  role: "supplier",
  tags: ["Молочная продукция", "СТМ", "Логистика"],
  targetSize: 10,
  frequency: "twice-weekly",
  since: "2026-07-14T00:00:00+03:00",
  materials: demoMaterials.map((material, index) => ({
    ...material,
    sourcePublishedAt: `2026-07-${String(23 - (index % 2)).padStart(2, "0")}T09:00:00+03:00`,
  })),
  events: demoEvents,
  now: "2026-07-24T12:00:00+03:00",
});

describe("createTelegramDeliveryPlan", () => {
  it("сохраняет целые новости и лимит Telegram", () => {
    const plan = createTelegramDeliveryPlan(
      issue,
      "https://digest.example.ru",
    );
    const itemIds = plan.flatMap((message) => message.itemIds);

    expect(plan.length).toBeGreaterThanOrEqual(2);
    expect(plan.length).toBeLessThanOrEqual(3);
    expect(plan.every((message) => message.html.length <= 4096)).toBe(true);
    expect(itemIds).toEqual(issue.items.map((item) => item.id));
    expect(new Set(itemIds).size).toBe(itemIds.length);
  });

  it("размещает CTA только в последнем сообщении", () => {
    const plan = createTelegramDeliveryPlan(
      issue,
      "https://digest.example.ru",
    );

    expect(plan.filter((message) => message.includesCta)).toHaveLength(1);
    expect(plan.at(-1)?.includesCta).toBe(true);
  });

  it("ведёт по Подробнее на прямую статью первоисточника", () => {
    const plan = createTelegramDeliveryPlan(
      issue,
      "https://digest.example.ru",
    );

    expect(plan[0].html).toContain(
      "https://www.retail.ru/news/krupneyshie-riteylery-uvelichili-chislo-sobstvennykh-marok-na-11-4-maya-2026-277386/",
    );
    expect(plan[0].html).not.toContain(
      "https://digest.example.ru/blog/rost-stm-federalnyh-setey",
    );
    expect(plan[0].html).toContain("Подробнее:");
    expect(plan[0].html).toContain("Открыть статью · Retail.ru");
    expect(plan[0].html).toContain("<blockquote>");
    expect(plan[0].html).toContain("📊 Ключевые цифры");
    expect(plan[0].html).toContain("Почему это важно:");
    expect(plan[0].html).not.toContain("────────");
  });
});

describe("escapeTelegramHtml", () => {
  it("экранирует пользовательские значения", () => {
    expect(escapeTelegramHtml('<b title="x">A & B</b>')).toBe(
      "&lt;b title=&quot;x&quot;&gt;A &amp; B&lt;/b&gt;",
    );
  });
});
