import {
  getMaterialRepository,
  type MaterialRepository,
} from "@/features/materials/material.repository";
import {
  getNewsCandidateRepository,
  type NewsCandidateRepository,
} from "@/features/news-ingestion/news-candidate.repository";
import type { NewsCandidate } from "@/features/news-ingestion/news-candidate.types";

export interface NewsAutoApprovalResult {
  eligible: number;
  approved: number;
  skipped: number;
  failed: Array<{ candidateId: string; error: string }>;
}

interface NewsAutoApprovalDependencies {
  candidates?: NewsCandidateRepository;
  materials?: MaterialRepository;
}

function isEligible(candidate: NewsCandidate, minimumConfidence: number) {
  return (
    candidate.status === "collected" &&
    candidate.verificationStatus === "structural-pass" &&
    candidate.verificationReasons.length === 0 &&
    candidate.confidence >= minimumConfidence
  );
}

/**
 * Promotes only candidates that already passed the source, freshness, tag and
 * metrics gates. Every repository operation is idempotent, so an interrupted
 * run can safely continue on the next ingestion tick.
 */
export async function autoApproveNewsCandidates(
  candidates: NewsCandidate[],
  minimumConfidence: number,
  dependencies: NewsAutoApprovalDependencies = {},
): Promise<NewsAutoApprovalResult> {
  const candidateRepository =
    dependencies.candidates ?? getNewsCandidateRepository();
  const materialRepository =
    dependencies.materials ?? getMaterialRepository();
  const eligible = candidates.filter((candidate) =>
    isEligible(candidate, minimumConfidence),
  );
  const failed: NewsAutoApprovalResult["failed"] = [];
  let approved = 0;

  for (const candidate of eligible) {
    try {
      const material = await materialRepository.createFromCandidate(candidate);
      const approvedMaterial = await materialRepository.updateStatus(
        material.id,
        "approved",
      );

      if (!approvedMaterial) {
        throw new Error("AUTO_APPROVAL_MATERIAL_NOT_FOUND");
      }

      await candidateRepository.updateStatus(candidate.id, "review");
      approved += 1;
    } catch (error) {
      failed.push({
        candidateId: candidate.id,
        error:
          error instanceof Error ? error.message : "AUTO_APPROVAL_FAILED",
      });
    }
  }

  return {
    eligible: eligible.length,
    approved,
    skipped: candidates.length - eligible.length,
    failed,
  };
}
