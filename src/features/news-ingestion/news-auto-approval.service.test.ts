import { describe, expect, it } from "vitest";

import { InMemoryMaterialRepository } from "@/features/materials/material.repository";
import { autoApproveNewsCandidates } from "@/features/news-ingestion/news-auto-approval.service";
import { InMemoryNewsCandidateRepository } from "@/features/news-ingestion/news-candidate.repository";
import type { NewsCandidate } from "@/features/news-ingestion/news-candidate.types";

function candidate(
  id: string,
  confidence: number,
  verificationStatus: NewsCandidate["verificationStatus"] = "structural-pass",
): NewsCandidate {
  return {
    id,
    title: "Продажи категории выросли на 20%",
    sourceName: "Проверенное издание",
    sourceUrl: `https://example.com/news/${id}`,
    publishedAt: "2026-08-23T08:00:00.000Z",
    collectedAt: "2026-08-23T09:00:00.000Z",
    summary: "Продажи категории заметно выросли по итогам отчётного периода.",
    marketImpact: "Изменение влияет на спрос и переговоры между сетями.",
    businessImpact: "Поставщикам стоит скорректировать предложение.",
    keyMetrics: [
      { value: "20%", label: "рост", context: "год к году" },
    ],
    tags: ["Молочная продукция"],
    confidence,
    status: "collected",
    verificationStatus,
    verificationReasons:
      verificationStatus === "structural-pass" ? [] : ["unverified"],
  };
}

describe("news auto approval", () => {
  it("идемпотентно утверждает только проверенные карточки выше порога", async () => {
    const candidates = new InMemoryNewsCandidateRepository();
    const materials = new InMemoryMaterialRepository();
    const approvedCandidate = candidate("approved", 0.91);
    const lowConfidenceCandidate = candidate("low", 0.7);
    const unverifiedCandidate = candidate("unverified", 0.95, "unverified");
    await candidates.saveRun(
      {
        id: "run_auto",
        startedAt: "2026-08-23T09:00:00.000Z",
        completedAt: "2026-08-23T09:01:00.000Z",
        model: "openai/test",
        sourceCount: 1,
        candidateCount: 3,
      },
      [approvedCandidate, lowConfidenceCandidate, unverifiedCandidate],
    );

    const first = await autoApproveNewsCandidates(
      await candidates.listCandidates(100),
      0.8,
      { candidates, materials },
    );
    const repeated = await autoApproveNewsCandidates(
      await candidates.listCandidates(100),
      0.8,
      { candidates, materials },
    );

    expect(first).toMatchObject({ eligible: 1, approved: 1, skipped: 2 });
    expect(repeated.approved).toBe(0);
    await expect(materials.listApproved()).resolves.toHaveLength(1);
    expect(await candidates.findById("approved")).toMatchObject({
      status: "review",
    });
  });
});
