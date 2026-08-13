import { desc, eq } from "drizzle-orm";

import type { SubscriptionInput } from "@/features/subscriptions/subscription.schema";
import { subscriptionSchema } from "@/features/subscriptions/subscription.schema";
import { getDatabase, type Database } from "@/shared/database/client";
import {
  subscriptions,
  subscriptionTags,
  telegramAccounts,
} from "@/shared/database/schema";

type RepositoryResult<T> = T | Promise<T>;

export interface TelegramIdentity {
  chatId: number;
  userId: number;
  username?: string;
  firstName: string;
}

export interface SubscriptionRecord extends SubscriptionInput {
  id: string;
  connectionToken: string;
  createdAt: string;
  lastDigestAt?: string;
  telegram?: TelegramIdentity & {
    connectedAt: string;
  };
}

export type TelegramConnectionResult =
  | { status: "connected"; subscription: SubscriptionRecord }
  | { status: "already-connected"; subscription: SubscriptionRecord }
  | { status: "not-found" }
  | { status: "conflict" };

export interface SubscriptionRepository {
  create(record: SubscriptionRecord): RepositoryResult<SubscriptionRecord>;
  findById(id: string): RepositoryResult<SubscriptionRecord | null>;
  findByConnectionToken(
    token: string,
  ): RepositoryResult<SubscriptionRecord | null>;
  list(): RepositoryResult<SubscriptionRecord[]>;
  connectTelegram(
    token: string,
    identity: TelegramIdentity,
    connectedAt: string,
  ): RepositoryResult<TelegramConnectionResult>;
  findByTelegramChatId(
    chatId: number,
  ): RepositoryResult<SubscriptionRecord | null>;
  getStats(): RepositoryResult<{
    total: number;
    telegramConnected: number;
  }>;
  markDigestSent(
    subscriptionId: string,
    sentAt: string,
  ): RepositoryResult<void>;
}

type SubscriptionRow = typeof subscriptions.$inferSelect;
type TelegramAccountRow = typeof telegramAccounts.$inferSelect;

function mapSubscription(
  row: SubscriptionRow,
  tags: string[],
  telegram?: TelegramAccountRow,
): SubscriptionRecord {
  const input = subscriptionSchema.parse({
    name: row.name,
    company: row.company,
    email: row.email,
    role: row.role,
    tags,
    frequency: row.frequency,
    targetSize: row.targetSize,
    consent: row.consent,
  });

  return {
    ...input,
    id: row.id,
    connectionToken: row.connectionToken,
    createdAt: row.createdAt,
    lastDigestAt: row.lastDigestAt ?? undefined,
    telegram: telegram
      ? {
          chatId: telegram.chatId,
          userId: telegram.userId,
          username: telegram.username ?? undefined,
          firstName: telegram.firstName,
          connectedAt: telegram.connectedAt,
        }
      : undefined,
  };
}

export class PostgresSubscriptionRepository
  implements SubscriptionRepository
{
  constructor(private readonly db: Database) {}

  async create(record: SubscriptionRecord): Promise<SubscriptionRecord> {
    await this.db.transaction(async (tx) => {
      await tx.insert(subscriptions).values({
        id: record.id,
        connectionToken: record.connectionToken,
        name: record.name,
        company: record.company,
        email: record.email,
        role: record.role,
        frequency: record.frequency,
        targetSize: record.targetSize,
        consent: record.consent,
        consentedAt: record.createdAt,
        createdAt: record.createdAt,
        updatedAt: record.createdAt,
      });

      if (record.tags.length) {
        await tx.insert(subscriptionTags).values(
          record.tags.map((tag) => ({
            subscriptionId: record.id,
            tag,
            createdAt: record.createdAt,
          })),
        );
      }
    });

    return record;
  }

  async findById(id: string): Promise<SubscriptionRecord | null> {
    const [row] = await this.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, id))
      .limit(1);

    return row ? this.hydrate(row) : null;
  }

  async findByConnectionToken(
    token: string,
  ): Promise<SubscriptionRecord | null> {
    const [row] = await this.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.connectionToken, token))
      .limit(1);

    return row ? this.hydrate(row) : null;
  }

  async list(): Promise<SubscriptionRecord[]> {
    const [rows, tagRows, accountRows] = await Promise.all([
      this.db.select().from(subscriptions).orderBy(desc(subscriptions.createdAt)),
      this.db.select().from(subscriptionTags),
      this.db.select().from(telegramAccounts),
    ]);
    const tagsBySubscription = new Map<string, string[]>();
    const accountBySubscription = new Map<string, TelegramAccountRow>();

    for (const tag of tagRows) {
      const values = tagsBySubscription.get(tag.subscriptionId) ?? [];
      values.push(tag.tag);
      tagsBySubscription.set(tag.subscriptionId, values);
    }

    for (const account of accountRows) {
      accountBySubscription.set(account.subscriptionId, account);
    }

    return rows.map((row) =>
      mapSubscription(
        row,
        tagsBySubscription.get(row.id) ?? [],
        accountBySubscription.get(row.id),
      ),
    );
  }

  async connectTelegram(
    token: string,
    identity: TelegramIdentity,
    connectedAt: string,
  ): Promise<TelegramConnectionResult> {
    try {
      return await this.db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.connectionToken, token))
          .limit(1);

        if (!row) {
          return { status: "not-found" } as const;
        }

        const [currentAccount] = await tx
          .select()
          .from(telegramAccounts)
          .where(eq(telegramAccounts.subscriptionId, row.id))
          .limit(1);

        if (currentAccount) {
          const subscription = await this.hydrate(row, tx, currentAccount);
          return currentAccount.chatId === identity.chatId
            ? ({ status: "already-connected", subscription } as const)
            : ({ status: "conflict" } as const);
        }

        const [chatAccount] = await tx
          .select()
          .from(telegramAccounts)
          .where(eq(telegramAccounts.chatId, identity.chatId))
          .limit(1);

        if (chatAccount) {
          return { status: "conflict" } as const;
        }

        const account: TelegramAccountRow = {
          subscriptionId: row.id,
          chatId: identity.chatId,
          userId: identity.userId,
          username: identity.username ?? null,
          firstName: identity.firstName,
          connectedAt,
          createdAt: connectedAt,
          updatedAt: connectedAt,
        };

        await tx.insert(telegramAccounts).values(account);
        const subscription = await this.hydrate(row, tx, account);
        return { status: "connected", subscription } as const;
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23505"
      ) {
        return { status: "conflict" };
      }

      throw error;
    }
  }

  async findByTelegramChatId(
    chatId: number,
  ): Promise<SubscriptionRecord | null> {
    const [account] = await this.db
      .select()
      .from(telegramAccounts)
      .where(eq(telegramAccounts.chatId, chatId))
      .limit(1);

    return account ? this.findById(account.subscriptionId) : null;
  }

  async getStats(): Promise<{ total: number; telegramConnected: number }> {
    const [allSubscriptions, allAccounts] = await Promise.all([
      this.db.select({ id: subscriptions.id }).from(subscriptions),
      this.db
        .select({ subscriptionId: telegramAccounts.subscriptionId })
        .from(telegramAccounts),
    ]);

    return {
      total: allSubscriptions.length,
      telegramConnected: allAccounts.length,
    };
  }

  async markDigestSent(subscriptionId: string, sentAt: string): Promise<void> {
    await this.db
      .update(subscriptions)
      .set({ lastDigestAt: sentAt, updatedAt: sentAt })
      .where(eq(subscriptions.id, subscriptionId));
  }

  private async hydrate(
    row: SubscriptionRow,
    database: Pick<Database, "select"> = this.db,
    knownAccount?: TelegramAccountRow,
  ): Promise<SubscriptionRecord> {
    const [tagRows, accountRows] = await Promise.all([
      database
        .select({ tag: subscriptionTags.tag })
        .from(subscriptionTags)
        .where(eq(subscriptionTags.subscriptionId, row.id)),
      knownAccount
        ? Promise.resolve([knownAccount])
        : database
            .select()
            .from(telegramAccounts)
            .where(eq(telegramAccounts.subscriptionId, row.id))
            .limit(1),
    ]);

    return mapSubscription(
      row,
      tagRows.map((item) => item.tag),
      accountRows[0],
    );
  }
}

export class InMemorySubscriptionRepository
  implements SubscriptionRepository
{
  private readonly byId = new Map<string, SubscriptionRecord>();
  private readonly idByToken = new Map<string, string>();
  private readonly idByChat = new Map<number, string>();

  create(record: SubscriptionRecord): SubscriptionRecord {
    this.byId.set(record.id, record);
    this.idByToken.set(record.connectionToken, record.id);
    return record;
  }

  findById(id: string): SubscriptionRecord | null {
    return this.byId.get(id) ?? null;
  }

  findByConnectionToken(token: string): SubscriptionRecord | null {
    const subscriptionId = this.idByToken.get(token);
    return subscriptionId ? (this.byId.get(subscriptionId) ?? null) : null;
  }

  list(): SubscriptionRecord[] {
    return [...this.byId.values()].sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    );
  }

  connectTelegram(
    token: string,
    identity: TelegramIdentity,
    connectedAt: string,
  ): TelegramConnectionResult {
    const subscriptionId = this.idByToken.get(token);

    if (!subscriptionId) {
      return { status: "not-found" };
    }

    const subscription = this.byId.get(subscriptionId);

    if (!subscription) {
      return { status: "not-found" };
    }

    if (subscription.telegram) {
      if (subscription.telegram.chatId === identity.chatId) {
        return { status: "already-connected", subscription };
      }

      return { status: "conflict" };
    }

    const existingSubscriptionId = this.idByChat.get(identity.chatId);

    if (
      existingSubscriptionId &&
      existingSubscriptionId !== subscription.id
    ) {
      return { status: "conflict" };
    }

    const connected: SubscriptionRecord = {
      ...subscription,
      telegram: {
        ...identity,
        connectedAt,
      },
    };

    this.byId.set(subscription.id, connected);
    this.idByChat.set(identity.chatId, subscription.id);

    return { status: "connected", subscription: connected };
  }

  findByTelegramChatId(chatId: number): SubscriptionRecord | null {
    const subscriptionId = this.idByChat.get(chatId);

    if (!subscriptionId) {
      return null;
    }

    return this.byId.get(subscriptionId) ?? null;
  }

  getStats() {
    return {
      total: this.byId.size,
      telegramConnected: this.idByChat.size,
    };
  }

  markDigestSent(subscriptionId: string, sentAt: string): void {
    const subscription = this.byId.get(subscriptionId);

    if (subscription) {
      this.byId.set(subscriptionId, { ...subscription, lastDigestAt: sentAt });
    }
  }
}

declare global {
  var saleTrackerSubscriptionRepository:
    | SubscriptionRepository
    | undefined;
}

export function getSubscriptionRepository(): SubscriptionRepository {
  if (!globalThis.saleTrackerSubscriptionRepository) {
    const db = getDatabase();
    globalThis.saleTrackerSubscriptionRepository = db
      ? new PostgresSubscriptionRepository(db)
      : new InMemorySubscriptionRepository();
  }

  return globalThis.saleTrackerSubscriptionRepository;
}
