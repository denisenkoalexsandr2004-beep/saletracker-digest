import { sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";

import { env } from "@/shared/config/env";
import * as schema from "@/shared/database/schema";

export type Database = PostgresJsDatabase<typeof schema>;

interface DatabaseRuntime {
  client: Sql;
  db: Database;
}

declare global {
  var saleTrackerDatabaseRuntime: DatabaseRuntime | undefined;
}

export function isDatabaseConfigured(): boolean {
  return Boolean(env.DATABASE_URL);
}

export function getDatabase(): Database | null {
  if (!env.DATABASE_URL) {
    return null;
  }

  if (!globalThis.saleTrackerDatabaseRuntime) {
    const client = postgres(env.DATABASE_URL, {
      max: env.DB_POOL_SIZE,
      connect_timeout: 10,
      idle_timeout: 20,
      max_lifetime: 60 * 30,
      prepare: false,
    });

    globalThis.saleTrackerDatabaseRuntime = {
      client,
      db: drizzle(client, { schema }),
    };
  }

  return globalThis.saleTrackerDatabaseRuntime.db;
}

export async function checkDatabase(): Promise<{
  configured: boolean;
  status: "ok" | "disabled" | "error";
}> {
  if (!env.DATABASE_URL) {
    return { configured: false, status: "disabled" };
  }

  try {
    const db = getDatabase();
    await db?.execute(sql`select 1`);
    return { configured: true, status: "ok" };
  } catch {
    return { configured: true, status: "error" };
  }
}
