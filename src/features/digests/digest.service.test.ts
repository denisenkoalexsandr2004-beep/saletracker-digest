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
  materials: demoMaterials.map((material, index) => ({
    ...material,
    sourcePublishedAt: `2026-07-${String(23 - (index % 2)).padStart(2, "0")}T09:00:00+03:00`,
  })),
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
    const limitedMaterials = baseInput.materials.filter((material) =>
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

  it("использует дополнительные релевантные материалы, если не хватает общерыночных", () => {
    const taggedOnly = baseInput.materials
      .filter(
        (material) =>
          material.scope === "tagged" &&
          material.tags.some((tag) => baseInput.tags.includes(tag)),
      )
      .slice(0, 5)
      .map((material) => ({
        ...material,
        tags: ["Молочная продукция"],
      }));
    const issue = buildDigestIssue({
      ...baseInput,
      targetSize: 5,
      materials: taggedOnly,
    });

    expect(issue.items).toHaveLength(5);
    expect(issue.personalizedCount).toBe(5);
    expect(issue.generalCount).toBe(0);
  });

  it("использует свежую широкую рыночную новость в общерыночных 20%", () => {
    const personalized = baseInput.materials
      .filter((material) => material.tags.includes("Молочная продукция"))
      .slice(0, 4);
    const marketWide: Material = {
      ...baseInput.materials[0],
      id: "market-wide",
      storyId: "market-wide-story",
      tags: ["Регулирование"],
      scope: "tagged",
    };
    const issue = buildDigestIssue({
      ...baseInput,
      targetSize: 5,
      materials: [...personalized, marketWide],
    });

    expect(issue.items.map((item) => item.id)).toContain("market-wide");
    expect(issue.generalCount).toBe(1);
  });

  it("не использует материалы до предыдущего выпуска", () => {
    const oldMaterial: Material = {
      ...baseInput.materials[0],
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

  it("не включает старую статью, даже если редактор утвердил её недавно", () => {
    const staleMaterial: Material = {
      ...baseInput.materials[0],
      id: "stale-source",
      storyId: "stale-source-story",
      sourcePublishedAt: "2026-06-01T09:00:00+03:00",
      approvedAt: "2026-07-24T10:00:00+03:00",
    };
    const issue = buildDigestIssue({
      ...baseInput,
      materials: [staleMaterial],
    });

    expect(issue.items).toHaveLength(0);
  });

  it("сортирует подходящие материалы по свежести первоисточника", () => {
    const older: Material = {
      ...baseInput.materials[0],
      id: "older",
      storyId: "older-story",
      importance: 100,
      sourcePublishedAt: "2026-07-22T09:00:00+03:00",
    };
    const newer: Material = {
      ...baseInput.materials[0],
      id: "newer",
      storyId: "newer-story",
      importance: 50,
      sourcePublishedAt: "2026-07-24T08:00:00+03:00",
    };
    const issue = buildDigestIssue({
      ...baseInput,
      targetSize: 1,
      materials: [older, newer],
    });

    expect(issue.items[0]?.id).toBe("newer");
  });

  it("убирает дубли одного сюжета", () => {
    const duplicate: Material = {
      ...baseInput.materials[0],
      id: "duplicate",
    };
    const issue = buildDigestIssue({
      ...baseInput,
      materials: [baseInput.materials[0], duplicate],
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
