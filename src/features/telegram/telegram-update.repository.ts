import { eq } from "drizzle-orm";

import { getDatabase, type Database } from "@/shared/database/client";
import { telegramUpdates } from "@/shared/database/schema";

type RepositoryResult<T> = T | Promise<T>;

export interface TelegramUpdateRepository {
  claim(updateId: number): RepositoryResult<boolean>;
  release(updateId: number): RepositoryResult<void>;
}

export class PostgresTelegramUpdateRepository
  implements TelegramUpdateRepository
{
  constructor(private readonly db: Database) {}

  async claim(updateId: number): Promise<boolean> {
    const [claimed] = await this.db
      .insert(telegramUpdates)
      .values({ updateId })
      .onConflictDoNothing({ target: telegramUpdates.updateId })
      .returning({ updateId: telegramUpdates.updateId });
    return Boolean(claimed);
  }

  async release(updateId: number): Promise<void> {
    await this.db
      .delete(telegramUpdates)
      .where(eq(telegramUpdates.updateId, updateId));
  }
}

export class InMemoryTelegramUpdateRepository
  implements TelegramUpdateRepository
{
  private readonly processed = new Set<number>();

  claim(updateId: number): boolean {
    if (this.processed.has(updateId)) {
      return false;
    }

    this.processed.add(updateId);

    if (this.processed.size > 10_000) {
      const oldest = this.processed.values().next().value;

      if (oldest !== undefined) {
        this.processed.delete(oldest);
      }
    }

    return true;
  }

  release(updateId: number): void {
    this.processed.delete(updateId);
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
