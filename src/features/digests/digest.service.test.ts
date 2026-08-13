import { describe, expect, it } from "vitest";

import {
  buildDigestIssue,
  findMatchingEvent,
  getEventCta,
} from "@/features/digests/digest.service";
import type { Material } from "@/features/digests/digest.types";
import { demoEvents, demoMaterials } from "@/shared/demo-data";

const baseInput = {
  role: "supplier" as const,
  tags: ["Молочная продукция", "СТМ", "Логистика"],
  targetSize: 10 as const,
  frequency: "twice-weekly" as const,
  since: "2026-07-14T00:00:00+03:00",
  materials: demoMaterials,
  events: demoEvents,
  now: "2026-07-24T12:00:00+03:00",
};

describe("buildDigestIssue", () => {
  it("собирает выпуск 80/20 только из утверждённых заметок", () => {
    const issue = buildDigestIssue(baseInput);

    expect(issue.items).toHaveLength(10);
    expect(issue.personalizedCount).toBe(8);
    expect(issue.generalCount).toBe(2);
    expect(issue.items.every((item) => item.status === "approved")).toBe(true);
    expect(issue.items.some((item) => item.id === "mat_12")).toBe(false);
  });

  it("не добавляет выдуманную добивку при нехватке материалов", () => {
    const limitedMaterials = demoMaterials.filter((material) =>
      ["mat_01", "mat_09"].includes(material.id),
    );
    const issue = buildDigestIssue({
      ...baseInput,
      materials: limitedMaterials,
    });

    expect(issue.items).toHaveLength(2);
    expect(issue.personalizedCount).toBe(1);
    expect(issue.generalCount).toBe(1);
  });

  it("не использует материалы до предыдущего выпуска", () => {
    const oldMaterial: Material = {
      ...demoMaterials[0],
      id: "old",
      storyId: "old-story",
      approvedAt: "2026-07-01T09:00:00+03:00",
    };
    const issue = buildDigestIssue({
      ...baseInput,
      materials: [oldMaterial],
    });

    expect(issue.items).toHaveLength(0);
  });

  it("убирает дубли одного сюжета", () => {
    const duplicate: Material = {
      ...demoMaterials[0],
      id: "duplicate",
    };
    const issue = buildDigestIssue({
      ...baseInput,
      materials: [demoMaterials[0], duplicate],
    });

    expect(issue.items).toHaveLength(1);
  });
});

describe("коммерческий маршрут ЦЗС", () => {
  it("выбирает ближайшее событие с максимальным совпадением тегов", () => {
    const event = findMatchingEvent(
      demoEvents,
      "supplier",
      ["Молочная продукция", "СТМ"],
      baseInput.now,
    );

    expect(event?.id).toBe("event_worldfood_2026");
  });

  it("формирует разные CTA для поставщика, закупщика и обеих ролей", () => {
    expect(getEventCta("supplier")).toContain("вывести свой продукт");
    expect(getEventCta("buyer")).toContain("новых поставщиков");
    expect(getEventCta("both")).toContain("закупок и поставок");
  });
});
