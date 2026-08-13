import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  TELEGRAM_BOT_USERNAME: z
    .string()
    .trim()
    .transform((value) => value.replace(/^@/, ""))
    .pipe(z.string().regex(/^[A-Za-z0-9_]{5,32}$/))
    .optional(),
  TELEGRAM_BOT_TOKEN: z
    .string()
    .trim()
    .regex(/^\d+:[A-Za-z0-9_-]{30,}$/)
    .optional(),
  TELEGRAM_WEBHOOK_SECRET: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{16,256}$/)
    .optional(),
  TELEGRAM_ADMIN_SECRET: z.string().trim().min(24).optional(),
  DATABASE_URL: z.string().trim().url().optional(),
  DB_POOL_SIZE: z.coerce.number().int().min(1).max(20).default(5),
  ADMIN_PASSWORD: z.string().min(12).optional(),
  SESSION_SECRET: z.string().min(32).optional(),
  CRON_SECRET: z.string().min(24).optional(),
  OPENAI_API_KEY: z.string().trim().min(20).optional(),
  OPENAI_NEWS_MODEL: z.string().trim().min(1).default("gpt-5.6-sol"),
});

export const env = envSchema.parse({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  TELEGRAM_BOT_USERNAME:
    process.env.TELEGRAM_BOT_USERNAME?.trim() || undefined,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN?.trim() || undefined,
  TELEGRAM_WEBHOOK_SECRET:
    process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || undefined,
  TELEGRAM_ADMIN_SECRET:
    process.env.TELEGRAM_ADMIN_SECRET?.trim() || undefined,
  DATABASE_URL: process.env.DATABASE_URL?.trim() || undefined,
  DB_POOL_SIZE: process.env.DB_POOL_SIZE,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || undefined,
  SESSION_SECRET: process.env.SESSION_SECRET?.trim() || undefined,
  CRON_SECRET: process.env.CRON_SECRET?.trim() || undefined,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY?.trim() || undefined,
  OPENAI_NEWS_MODEL: process.env.OPENAI_NEWS_MODEL,
});
