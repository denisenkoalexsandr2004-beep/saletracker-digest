import { eq } from "drizzle-orm";

import { getDatabase, type Database } from "@/shared/database/client";
import { telegramUpdates } from "@/shared/database/schema";

type RepositoryResult<T> = T | Promise<T>;

export interface TelegramUpdateRepository {
  has(updateId: number): RepositoryResult<boolean>;
  markProcessed(updateId: number): RepositoryResult<void>;
}

export class PostgresTelegramUpdateRepository
  implements TelegramUpdateRepository
{
  constructor(private readonly db: Database) {}

  async has(updateId: number): Promise<boolean> {
    const [row] = await this.db
      .select({ updateId: telegramUpdates.updateId })
      .from(telegramUpdates)
      .where(eq(telegramUpdates.updateId, updateId))
      .limit(1);
    return Boolean(row);
  }

  async markProcessed(updateId: number): Promise<void> {
    await this.db
      .insert(telegramUpdates)
      .values({ updateId })
      .onConflictDoNothing({ target: telegramUpdates.updateId });
  }
}

export class InMemoryTelegramUpdateRepository
  implements TelegramUpdateRepository
{
  private readonly processed = new Set<number>();

  has(updateId: number): boolean {
    return this.processed.has(updateId);
  }

  markProcessed(updateId: number): void {
    this.processed.add(updateId);

    if (this.processed.size > 10_000) {
      const oldest = this.processed.values().next().value;

      if (oldest !== undefined) {
        this.processed.delete(oldest);
      }
    }
  }
}

declare global {
  var saleTrackerTelegramUpdateRepository:
    | TelegramUpdateRepository
    | undefined;
}

export function getTelegramUpdateRepository(): TelegramUpdateRepository {
  if (!globalThis.saleTrackerTelegramUpdateRepository) {
    const db = getDatabase();
    globalThis.saleTrackerTelegramUpdateRepository = db
      ? new PostgresTelegramUpdateRepository(db)
      : new InMemoryTelegramUpdateRepository();
  }

  return globalThis.saleTrackerTelegramUpdateRepository;
}
