import { existsSync, readFileSync } from "node:fs";

import { defineConfig } from "drizzle-kit";

function readLocalEnv(name: string): string | undefined {
  if (!existsSync(".env.local")) {
    return undefined;
  }

  const line = readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .find((value) => value.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim() || undefined;
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/shared/database/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      readLocalEnv("DATABASE_URL") ??
      "postgresql://localhost/saletracker",
  },
  strict: true,
  verbose: true,
});
