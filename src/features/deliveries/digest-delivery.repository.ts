import { and, desc, eq, inArray, sql } from "drizzle-orm";

import type {
  DigestDeliveryRecord,
  DigestDeliveryStatus,
} from "@/features/deliveries/digest-delivery.types";
import { getDatabase, type Database } from "@/shared/database/client";
import { digestDeliveries } from "@/shared/database/schema";

type RepositoryResult<T> = T | Promise<T>;

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

    if (!current || current.status === "sent") {
      return current;
    }

    const [row] = await this.db
      .update(digestDeliveries)
      .set({ status: "ready", updatedAt, error: null })
      .where(eq(digestDeliveries.id, current.id))
      .returning();
    return row ? mapDelivery(row) : null;
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

    const delivery = await this.findById(id);

    if (!delivery) {
      return { status: "not-found" };
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

    if (!delivery || delivery.status === "sent") {
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
      return { status: "already-sending", delivery };
    }

    if (delivery.status === "sent") {
      return { status: "already-sent", delivery };
    }

    const claimed = this.update(id, {
      status: "sending",
      updatedAt,
      error: undefined,
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
