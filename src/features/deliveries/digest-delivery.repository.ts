import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import type {
  DigestDeliveryRecord,
  DigestDeliveryStatus,
  DeliveryMessageCheckpoint,
} from "@/features/deliveries/digest-delivery.types";
import { getDatabase, type Database } from "@/shared/database/client";
import {
  deliveryMessages,
  digestDeliveries,
} from "@/shared/database/schema";

type RepositoryResult<T> = T | Promise<T>;
const DELIVERY_LEASE_MS = 15 * 60 * 1_000;

function isDeliveryLeaseExpired(
  delivery: DigestDeliveryRecord,
  claimedAt: string,
): boolean {
  return (
    Date.parse(claimedAt) - Date.parse(delivery.updatedAt) >= DELIVERY_LEASE_MS
  );
}

export type ClaimDeliveryResult =
  | { status: "claimed"; delivery: DigestDeliveryRecord }
  | { status: "not-found" }
  | {
      status: "not-ready" | "already-sending" | "already-sent";
      delivery: DigestDeliveryRecord;
    };

export interface DigestDeliveryRepository {
  create(record: DigestDeliveryRecord): RepositoryResult<DigestDeliveryRecord>;
  findById(id: string): RepositoryResult<DigestDeliveryRecord | null>;
  findByIssueKey(
    issueKey: string,
  ): RepositoryResult<DigestDeliveryRecord | null>;
  findBySubscriptionId(
    subscriptionId: string,
  ): RepositoryResult<DigestDeliveryRecord | null>;
  list(limit?: number): RepositoryResult<DigestDeliveryRecord[]>;
  markReadyBySubscriptionId(
    subscriptionId: string,
    updatedAt: string,
  ): RepositoryResult<DigestDeliveryRecord | null>;
  claimForSending(
    id: string,
    updatedAt: string,
  ): RepositoryResult<ClaimDeliveryResult>;
  markSent(
    id: string,
    sentAt: string,
  ): RepositoryResult<DigestDeliveryRecord | null>;
  markFailed(
    id: string,
    error: string,
    updatedAt: string,
  ): RepositoryResult<DigestDeliveryRecord | null>;
  ensureMessageCheckpoints(
    deliveryId: string,
    count: number,
    createdAt: string,
  ): RepositoryResult<DeliveryMessageCheckpoint[]>;
  markMessageSent(
    deliveryId: string,
    sequence: number,
    sentAt: string,
  ): RepositoryResult<void>;
  markMessageFailed(
    deliveryId: string,
    sequence: number,
    error: string,
    updatedAt: string,
  ): RepositoryResult<void>;
}

type DeliveryRow = typeof digestDeliveries.$inferSelect;

function mapDelivery(row: DeliveryRow): DigestDeliveryRecord {
  return {
    id: row.id,
    subscriptionId: row.subscriptionId,
    issueKey: row.issueKey,
    issue: row.issue,
    status: row.status as DigestDeliveryStatus,
    attemptCount: row.attemptCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    sentAt: row.sentAt ?? undefined,
    error: row.error ?? undefined,
  };
}

type DeliveryMessageRow = typeof deliveryMessages.$inferSelect;

function mapMessageCheckpoint(
  row: DeliveryMessageRow,
): DeliveryMessageCheckpoint {
  return {
    id: row.id,
    deliveryId: row.deliveryId,
    sequence: row.sequence,
    status: row.status as DeliveryMessageCheckpoint["status"],
    sentAt: row.sentAt ?? undefined,
    error: row.error ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class PostgresDigestDeliveryRepository
  implements DigestDeliveryRepository
{
  constructor(private readonly db: Database) {}

  async create(record: DigestDeliveryRecord): Promise<DigestDeliveryRecord> {
    const [created] = await this.db
      .insert(digestDeliveries)
      .values({
        id: record.id,
        subscriptionId: record.subscriptionId,
        issueKey: record.issueKey,
        issue: record.issue,
        status: record.status,
        attemptCount: record.attemptCount,
        sentAt: record.sentAt,
        error: record.error,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      })
      .onConflictDoNothing({ target: digestDeliveries.issueKey })
      .returning();

    if (created) {
      return mapDelivery(created);
    }

    const existing = await this.findByIssueKey(record.issueKey);
    return existing ?? record;
  }

  async findById(id: string): Promise<DigestDeliveryRecord | null> {
    const [row] = await this.db
      .select()
      .from(digestDeliveries)
      .where(eq(digestDeliveries.id, id))
      .limit(1);
    return row ? mapDelivery(row) : null;
  }

  async findByIssueKey(
    issueKey: string,
  ): Promise<DigestDeliveryRecord | null> {
    const [row] = await this.db
      .select()
      .from(digestDeliveries)
      .where(eq(digestDeliveries.issueKey, issueKey))
      .limit(1);
    return row ? mapDelivery(row) : null;
  }

  async findBySubscriptionId(
    subscriptionId: string,
  ): Promise<DigestDeliveryRecord | null> {
    const [row] = await this.db
      .select()
      .from(digestDeliveries)
      .where(eq(digestDeliveries.subscriptionId, subscriptionId))
      .orderBy(desc(digestDeliveries.createdAt))
      .limit(1);
    return row ? mapDelivery(row) : null;
  }

  async list(limit = 20): Promise<DigestDeliveryRecord[]> {
    const rows = await this.db
      .select()
      .from(digestDeliveries)
      .orderBy(desc(digestDeliveries.createdAt))
      .limit(Math.max(1, Math.min(limit, 100)));
    return rows.map(mapDelivery);
  }

  async markReadyBySubscriptionId(
    subscriptionId: string,
    updatedAt: string,
  ): Promise<DigestDeliveryRecord | null> {
    const current = await this.findBySubscriptionId(subscriptionId);

    if (
      !current ||
      current.status === "ready" ||
      current.status === "sending" ||
      current.status === "sent"
    ) {
      return current;
    }

    const [row] = await this.db
      .update(digestDeliveries)
      .set({ status: "ready", updatedAt, error: null })
      .where(
        and(
          eq(digestDeliveries.id, current.id),
          inArray(digestDeliveries.status, ["waiting-telegram", "failed"]),
        ),
      )
      .returning();
    return row ? mapDelivery(row) : this.findById(current.id);
  }

  async claimForSending(
    id: string,
    updatedAt: string,
  ): Promise<ClaimDeliveryResult> {
    const [claimed] = await this.db
      .update(digestDeliveries)
      .set({
        status: "sending",
        updatedAt,
        error: null,
        attemptCount: sql`${digestDeliveries.attemptCount} + 1`,
      })
      .where(
        and(
          eq(digestDeliveries.id, id),
          inArray(digestDeliveries.status, ["ready", "failed"]),
        ),
      )
      .returning();

    if (claimed) {
      return { status: "claimed", delivery: mapDelivery(claimed) };
    }

    let delivery = await this.findById(id);

    if (!delivery) {
      return { status: "not-found" };
    }

    if (
      delivery.status === "sending" &&
      isDeliveryLeaseExpired(delivery, updatedAt)
    ) {
      const [reclaimed] = await this.db
        .update(digestDeliveries)
        .set({
          status: "sending",
          updatedAt,
          error: null,
          attemptCount: sql`${digestDeliveries.attemptCount} + 1`,
        })
        .where(
          and(
            eq(digestDeliveries.id, id),
            eq(digestDeliveries.status, "sending"),
            eq(digestDeliveries.updatedAt, delivery.updatedAt),
          ),
        )
        .returning();

      if (reclaimed) {
        return { status: "claimed", delivery: mapDelivery(reclaimed) };
      }

      delivery = (await this.findById(id)) ?? delivery;
    }

    if (delivery.status === "waiting-telegram") {
      return { status: "not-ready", delivery };
    }

    if (delivery.status === "sent") {
      return { status: "already-sent", delivery };
    }

    return { status: "already-sending", delivery };
  }

  async markSent(
    id: string,
    sentAt: string,
  ): Promise<DigestDeliveryRecord | null> {
    return this.update(id, {
      status: "sent",
      updatedAt: sentAt,
      sentAt,
      error: null,
    });
  }

  async markFailed(
    id: string,
    error: string,
    updatedAt: string,
  ): Promise<DigestDeliveryRecord | null> {
    return this.update(id, { status: "failed", updatedAt, error });
  }

  async ensureMessageCheckpoints(
    deliveryId: string,
    count: number,
    createdAt: string,
  ): Promise<DeliveryMessageCheckpoint[]> {
    if (count > 0) {
      await this.db
        .insert(deliveryMessages)
        .values(
          Array.from({ length: count }, (_, sequence) => ({
            id: `message:${deliveryId}:${sequence}`,
            deliveryId,
            sequence,
            status: "pending",
            createdAt,
            updatedAt: createdAt,
          })),
        )
        .onConflictDoNothing({
          target: [deliveryMessages.deliveryId, deliveryMessages.sequence],
        });
    }

    const rows = await this.db
      .select()
      .from(deliveryMessages)
      .where(eq(deliveryMessages.deliveryId, deliveryId))
      .orderBy(asc(deliveryMessages.sequence));
    return rows.map(mapMessageCheckpoint);
  }

  async markMessageSent(
    deliveryId: string,
    sequence: number,
    sentAt: string,
  ): Promise<void> {
    await this.db
      .update(deliveryMessages)
      .set({ status: "sent", sentAt, updatedAt: sentAt, error: null })
      .where(
        and(
          eq(deliveryMessages.deliveryId, deliveryId),
          eq(deliveryMessages.sequence, sequence),
        ),
      );
  }

  async markMessageFailed(
    deliveryId: string,
    sequence: number,
    error: string,
    updatedAt: string,
  ): Promise<void> {
    await this.db
      .update(deliveryMessages)
      .set({ status: "failed", error, updatedAt })
      .where(
        and(
          eq(deliveryMessages.deliveryId, deliveryId),
          eq(deliveryMessages.sequence, sequence),
        ),
      );
  }

  private async update(
    id: string,
    patch: Partial<typeof digestDeliveries.$inferInsert>,
  ): Promise<DigestDeliveryRecord | null> {
    const [row] = await this.db
      .update(digestDeliveries)
      .set(patch)
      .where(eq(digestDeliveries.id, id))
      .returning();
    return row ? mapDelivery(row) : null;
  }
}

export class InMemoryDigestDeliveryRepository
  implements DigestDeliveryRepository
{
  private readonly byId = new Map<string, DigestDeliveryRecord>();
  private readonly idBySubscription = new Map<string, string>();
  private readonly messageCheckpoints = new Map<
    string,
    DeliveryMessageCheckpoint
  >();

  create(record: DigestDeliveryRecord): DigestDeliveryRecord {
    const existing = this.findByIssueKey(record.issueKey);

    if (existing) {
      return existing;
    }

    this.byId.set(record.id, record);
    this.idBySubscription.set(record.subscriptionId, record.id);
    return record;
  }

  findById(id: string): DigestDeliveryRecord | null {
    return this.byId.get(id) ?? null;
  }

  findByIssueKey(issueKey: string): DigestDeliveryRecord | null {
    return (
      [...this.byId.values()].find(
        (delivery) => delivery.issueKey === issueKey,
      ) ?? null
    );
  }

  findBySubscriptionId(subscriptionId: string): DigestDeliveryRecord | null {
    const id = this.idBySubscription.get(subscriptionId);
    return id ? (this.byId.get(id) ?? null) : null;
  }

  list(limit = 20): DigestDeliveryRecord[] {
    return [...this.byId.values()]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, Math.max(1, Math.min(limit, 100)));
  }

  markReadyBySubscriptionId(
    subscriptionId: string,
    updatedAt: string,
  ): DigestDeliveryRecord | null {
    const delivery = this.findBySubscriptionId(subscriptionId);

    if (
      !delivery ||
      delivery.status === "ready" ||
      delivery.status === "sending" ||
      delivery.status === "sent"
    ) {
      return delivery;
    }

    return this.update(delivery.id, {
      status: "ready",
      updatedAt,
      error: undefined,
    });
  }

  claimForSending(id: string, updatedAt: string): ClaimDeliveryResult {
    const delivery = this.findById(id);

    if (!delivery) {
      return { status: "not-found" };
    }

    if (delivery.status === "waiting-telegram") {
      return { status: "not-ready", delivery };
    }

    if (delivery.status === "sending") {
      if (!isDeliveryLeaseExpired(delivery, updatedAt)) {
        return { status: "already-sending", delivery };
      }
    }

    if (delivery.status === "sent") {
      return { status: "already-sent", delivery };
    }

    const claimed = this.update(id, {
      status: "sending",
      updatedAt,
      error: undefined,
      attemptCount: delivery.attemptCount + 1,
    });

    return { status: "claimed", delivery: claimed as DigestDeliveryRecord };
  }

  markSent(id: string, sentAt: string): DigestDeliveryRecord | null {
    return this.update(id, {
      status: "sent",
      updatedAt: sentAt,
      sentAt,
      error: undefined,
    });
  }

  markFailed(
    id: string,
    error: string,
    updatedAt: string,
  ): DigestDeliveryRecord | null {
    return this.update(id, {
      status: "failed",
      updatedAt,
      error,
    });
  }

  ensureMessageCheckpoints(
    deliveryId: string,
    count: number,
    createdAt: string,
  ): DeliveryMessageCheckpoint[] {
    for (let sequence = 0; sequence < count; sequence += 1) {
      const key = `${deliveryId}:${sequence}`;

      if (!this.messageCheckpoints.has(key)) {
        this.messageCheckpoints.set(key, {
          id: `message:${deliveryId}:${sequence}`,
          deliveryId,
          sequence,
          status: "pending",
          createdAt,
          updatedAt: createdAt,
        });
      }
    }

    return [...this.messageCheckpoints.values()]
      .filter((message) => message.deliveryId === deliveryId)
      .sort((left, right) => left.sequence - right.sequence);
  }

  markMessageSent(
    deliveryId: string,
    sequence: number,
    sentAt: string,
  ): void {
    this.updateMessage(deliveryId, sequence, {
      status: "sent",
      sentAt,
      updatedAt: sentAt,
      error: undefined,
    });
  }

  markMessageFailed(
    deliveryId: string,
    sequence: number,
    error: string,
    updatedAt: string,
  ): void {
    this.updateMessage(deliveryId, sequence, {
      status: "failed",
      error,
      updatedAt,
    });
  }

  private updateMessage(
    deliveryId: string,
    sequence: number,
    patch: Partial<DeliveryMessageCheckpoint>,
  ): void {
    const key = `${deliveryId}:${sequence}`;
    const current = this.messageCheckpoints.get(key);

    if (current) {
      this.messageCheckpoints.set(key, { ...current, ...patch });
    }
  }

  private update(
    id: string,
    patch: Partial<DigestDeliveryRecord> & {
      status: DigestDeliveryStatus;
      updatedAt: string;
    },
  ): DigestDeliveryRecord | null {
    const delivery = this.byId.get(id);

    if (!delivery) {
      return null;
    }

    const updated = { ...delivery, ...patch };
    this.byId.set(id, updated);
    return updated;
  }
}

declare global {
  var saleTrackerDigestDeliveryRepository:
    | DigestDeliveryRepository
    | undefined;
}

export function getDigestDeliveryRepository(): DigestDeliveryRepository {
  if (!globalThis.saleTrackerDigestDeliveryRepository) {
    const db = getDatabase();
    globalThis.saleTrackerDigestDeliveryRepository = db
      ? new PostgresDigestDeliveryRepository(db)
      : new InMemoryDigestDeliveryRepository();
  }

  return globalThis.saleTrackerDigestDeliveryRepository;
}
