import type { DigestIssue } from "@/features/digests/digest.types";
import type {
  DigestFrequency,
  SubscriberRole,
} from "@/features/subscriptions/subscription.types";

export const digestDeliveryStatuses = [
  "waiting-telegram",
  "ready",
  "sending",
  "sent",
  "failed",
] as const;

export type DigestDeliveryStatus = (typeof digestDeliveryStatuses)[number];

export type DeliveryMessageStatus = "pending" | "sent" | "failed";

export interface DeliveryMessageCheckpoint {
  id: string;
  deliveryId: string;
  sequence: number;
  status: DeliveryMessageStatus;
  sentAt?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DigestDeliveryRecord {
  id: string;
  subscriptionId: string;
  issueKey: string;
  issue: DigestIssue;
  status: DigestDeliveryStatus;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
  sentAt?: string;
  error?: string;
}

export interface DigestDeliveryView {
  id: string;
  status: DigestDeliveryStatus;
  createdAt: string;
  updatedAt: string;
  sentAt?: string;
  error?: string;
  subscriber: {
    name: string;
    company: string;
    role: SubscriberRole;
    tags: string[];
    frequency: DigestFrequency;
    targetSize: number;
    telegramConnected: boolean;
    telegramUsername?: string;
  };
  issue: {
    id: string;
    itemCount: number;
    personalizedCount: number;
    generalCount: number;
    eventName?: string;
    items: Array<{
      id: string;
      title: string;
      articlePath: string;
      sourceUrls: string[];
      metrics: string[];
    }>;
  };
}
