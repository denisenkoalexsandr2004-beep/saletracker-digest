import type { MaterialStatus } from "@/features/digests/digest.types";
import { getNewsCandidateRepository } from "@/features/news-ingestion/news-candidate.repository";
import {
  getMaterialRepository,
  type MaterialRepository,
} from "@/features/materials/material.repository";

export class MaterialWorkflowError extends Error {
  constructor(
    public readonly code: "CANDIDATE_NOT_FOUND" | "MATERIAL_NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "MaterialWorkflowError";
  }
}

export async function promoteCandidateToReview(
  candidateId: string,
  repository: MaterialRepository = getMaterialRepository(),
) {
  const candidates = getNewsCandidateRepository();
  const candidate = await candidates.findById(candidateId);

  if (!candidate) {
    throw new MaterialWorkflowError(
      "CANDIDATE_NOT_FOUND",
      "Кандидат новости не найден.",
    );
  }

  const material = await repository.createFromCandidate(candidate);
  await candidates.updateStatus(candidate.id, "review");
  return material;
}

export async function changeMaterialStatus(
  materialId: string,
  status: MaterialStatus,
  repository: MaterialRepository = getMaterialRepository(),
) {
  const material = await repository.updateStatus(materialId, status);

  if (!material) {
    throw new MaterialWorkflowError(
      "MATERIAL_NOT_FOUND",
      "Редакционный материал не найден.",
    );
  }

  return material;
}
