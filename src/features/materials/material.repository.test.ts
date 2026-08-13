import { describe, expect, it } from "vitest";

import { InMemoryMaterialRepository } from "@/features/materials/material.repository";
import type { NewsCandidate } from "@/features/news-ingestion/news-candidate.types";

const candidate: NewsCandidate = {
  id: "candidate_test",
  title: "Сеть изменила требования к поставщикам молочной продукции",
  sourceName: "Retail.ru",
  sourceUrl: "https://retail.ru/news/test-material/",
  publishedAt: "2026-08-13T08:00:00.000Z",
  collectedAt: "2026-08-13T09:00:00.000Z",
  summary: "Тестовая сеть опубликовала новые требования к поставщикам.",
  marketImpact: "Поставщикам потребуется обновить документы и логистику.",
  businessImpact: "Изменение влияет на сроки допуска товара в ассортимент.",
  keyMetrics: [
    { value: "15%", label: "изменение", context: "Проверяемая цифра" },
  ],
  tags: ["Молочная продукция", "Федеральные сети"],
  confidence: 0.87,
  status: "collected",
  verificationStatus: "structural-pass",
  verificationReasons: [],
};

describe("material repository", () => {
  it("создаёт один review-материал и утверждает его", async () => {
    const repository = new InMemoryMaterialRepository();
    const created = await repository.createFromCandidate(candidate);
    const repeated = await repository.createFromCandidate(candidate);
    const approved = await repository.updateStatus(created.id, "approved");

    expect(created.status).toBe("review");
    expect(repeated.id).toBe(created.id);
    expect(approved?.status).toBe("approved");
    expect(approved?.approvedAt).toBeTruthy();
    expect(await repository.listApproved()).toHaveLength(1);
  });
});
