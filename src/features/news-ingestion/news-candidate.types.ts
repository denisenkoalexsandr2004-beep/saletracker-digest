import type { MaterialMetric } from "@/features/digests/digest.types";

export type NewsCandidateStatus = "collected" | "review" | "rejected";

export interface NewsCandidate {
  id: string;
  title: string;
  sourceName: string;
  sourceUrl: string;
  publishedAt: string;
  collectedAt: string;
  summary: string;
  marketImpact: string;
  businessImpact: string;
  keyMetrics: MaterialMetric[];
  tags: string[];
  confidence: number;
  status: NewsCandidateStatus;
  verificationStatus: "structural-pass" | "unverified";
  verificationReasons: string[];
}

export interface NewsIngestionRun {
  id: string;
  startedAt: string;
  completedAt: string;
  model: string;
  sourceCount: number;
  candidateCount: number;
}
