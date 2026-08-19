import type {
  DigestFrequency,
  SubscriberRole,
} from "@/features/subscriptions/subscription.types";

export type MaterialStatus = "collected" | "draft" | "review" | "approved";
export type MaterialScope = "tagged" | "general" | "positive";

export interface MaterialMetric {
  value: string;
  label: string;
  context: string;
}

export interface Material {
  id: string;
  storyId: string;
  title: string;
  summary: string;
  impact: string;
  businessImpact: string;
  keyMetrics: MaterialMetric[];
  articlePath: string;
  sourceNames: string[];
  sourceUrls: string[];
  sourcePublishedAt: string;
  tags: string[];
  scope: MaterialScope;
  status: MaterialStatus;
  approvedAt?: string;
  importance: number;
}

export interface CzsEvent {
  id: string;
  name: string;
  format: "ЦЗС" | "Контракт Экспо";
  startsAt: string;
  endsAt: string;
  location: string;
  tags: string[];
  roles: SubscriberRole[];
  supplierUrl: string;
  buyerUrl: string;
  status: "upcoming" | "completed";
}

export interface DigestSelectionInput {
  role: SubscriberRole;
  tags: string[];
  targetSize: number;
  frequency: DigestFrequency;
  since: string;
  sourceSince?: string;
  materials: Material[];
  events: CzsEvent[];
  now: string;
}

export interface DigestIssue {
  id: string;
  generatedAt: string;
  frequency: DigestFrequency;
  targetSize: number;
  items: Material[];
  personalizedCount: number;
  generalCount: number;
  event: CzsEvent | null;
  cta: string;
  ctaUrl: string;
}
