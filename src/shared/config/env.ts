import { z } from "zod";

const envSchema = z.object({
  APP_URL: z.url().default("http://localhost:3000"),
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
  ADMIN_PASSWORD: z.string().trim().min(12).optional(),
  SESSION_SECRET: z.string().min(32).optional(),
  CRON_SECRET: z.string().min(24).optional(),
  NEWS_AI_PROVIDER: z.enum(["openai", "perplexity"]).default("openai"),
  OPENAI_API_KEY: z.string().trim().min(20).optional(),
  OPENAI_NEWS_MODEL: z.string().trim().min(1).default("gpt-5.6-luna"),
  PERPLEXITY_API_KEY: z.string().trim().min(20).optional(),
  PERPLEXITY_NEWS_MODEL: z.string().trim().min(1).default("sonar"),
  NEWS_INGESTION_MAX_AGE_MINUTES: z.coerce
    .number()
    .int()
    .min(30)
    .max(1_440)
    .default(150),
  NEWS_APPROVED_SOURCE_MAX_AGE_HOURS: z.coerce
    .number()
    .int()
    .min(24)
    .max(720)
    .default(48),
  NEWS_AGENT_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(10_000)
    .max(300_000)
    .default(55_000),
  NEWS_PROCESSING_BATCH_SIZE: z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .default(8),
  NEWS_PROCESSING_CONCURRENCY: z.coerce
    .number()
    .int()
    .min(1)
    .max(10)
    .default(3),
  NEWS_PROCESSING_MAX_ATTEMPTS: z.coerce
    .number()
    .int()
    .min(1)
    .max(10)
    .default(3),
  NEWS_PROCESSING_RETRY_DELAY_MS: z.coerce
    .number()
    .int()
    .min(10_000)
    .max(86_400_000)
    .default(300_000),
  NEWS_PROCESSING_LEASE_MINUTES: z.coerce
    .number()
    .int()
    .min(1)
    .max(120)
    .default(15),
  NEWS_DEAD_LETTER_RETRY_HOURS: z.coerce
    .number()
    .int()
    .min(1)
    .max(168)
    .default(6),
  NEWS_DEAD_LETTER_REQUEUE_BATCH_SIZE: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(24),
  NEWS_AUTO_APPROVE: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  NEWS_AUTO_APPROVE_MIN_CONFIDENCE: z.coerce
    .number()
    .min(0.5)
    .max(1)
    .default(0.8),
  DIGEST_DISPATCH_BATCH_SIZE: z.coerce
    .number()
    .int()
    .min(1)
    .max(20)
    .default(6),
});

function optionalTrimmed(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

export function parseEnvironment(
  source: Readonly<Record<string, string | undefined>>,
) {
  return envSchema.parse({
    APP_URL:
      optionalTrimmed(source.APP_URL) ||
      optionalTrimmed(source.NEXT_PUBLIC_APP_URL) ||
      undefined,
    TELEGRAM_BOT_USERNAME: optionalTrimmed(source.TELEGRAM_BOT_USERNAME),
    TELEGRAM_BOT_TOKEN: optionalTrimmed(source.TELEGRAM_BOT_TOKEN),
    TELEGRAM_WEBHOOK_SECRET: optionalTrimmed(source.TELEGRAM_WEBHOOK_SECRET),
    TELEGRAM_ADMIN_SECRET: optionalTrimmed(source.TELEGRAM_ADMIN_SECRET),
    DATABASE_URL: optionalTrimmed(source.DATABASE_URL),
    DB_POOL_SIZE: optionalTrimmed(source.DB_POOL_SIZE),
    ADMIN_PASSWORD: optionalTrimmed(source.ADMIN_PASSWORD),
    SESSION_SECRET: optionalTrimmed(source.SESSION_SECRET),
    CRON_SECRET: optionalTrimmed(source.CRON_SECRET),
    NEWS_AI_PROVIDER: optionalTrimmed(source.NEWS_AI_PROVIDER),
    OPENAI_API_KEY: optionalTrimmed(source.OPENAI_API_KEY),
    OPENAI_NEWS_MODEL: optionalTrimmed(source.OPENAI_NEWS_MODEL),
    PERPLEXITY_API_KEY: optionalTrimmed(source.PERPLEXITY_API_KEY),
    PERPLEXITY_NEWS_MODEL: optionalTrimmed(source.PERPLEXITY_NEWS_MODEL),
    NEWS_INGESTION_MAX_AGE_MINUTES: optionalTrimmed(
      source.NEWS_INGESTION_MAX_AGE_MINUTES,
    ),
    NEWS_APPROVED_SOURCE_MAX_AGE_HOURS: optionalTrimmed(
      source.NEWS_APPROVED_SOURCE_MAX_AGE_HOURS,
    ),
    NEWS_AGENT_TIMEOUT_MS: optionalTrimmed(source.NEWS_AGENT_TIMEOUT_MS),
    NEWS_PROCESSING_BATCH_SIZE: optionalTrimmed(
      source.NEWS_PROCESSING_BATCH_SIZE,
    ),
    NEWS_PROCESSING_CONCURRENCY: optionalTrimmed(
      source.NEWS_PROCESSING_CONCURRENCY,
    ),
    NEWS_PROCESSING_MAX_ATTEMPTS: optionalTrimmed(
      source.NEWS_PROCESSING_MAX_ATTEMPTS,
    ),
    NEWS_PROCESSING_RETRY_DELAY_MS: optionalTrimmed(
      source.NEWS_PROCESSING_RETRY_DELAY_MS,
    ),
    NEWS_PROCESSING_LEASE_MINUTES: optionalTrimmed(
      source.NEWS_PROCESSING_LEASE_MINUTES,
    ),
    NEWS_DEAD_LETTER_RETRY_HOURS: optionalTrimmed(
      source.NEWS_DEAD_LETTER_RETRY_HOURS,
    ),
    NEWS_DEAD_LETTER_REQUEUE_BATCH_SIZE: optionalTrimmed(
      source.NEWS_DEAD_LETTER_REQUEUE_BATCH_SIZE,
    ),
    NEWS_AUTO_APPROVE: optionalTrimmed(source.NEWS_AUTO_APPROVE),
    NEWS_AUTO_APPROVE_MIN_CONFIDENCE: optionalTrimmed(
      source.NEWS_AUTO_APPROVE_MIN_CONFIDENCE,
    ),
    DIGEST_DISPATCH_BATCH_SIZE: optionalTrimmed(
      source.DIGEST_DISPATCH_BATCH_SIZE,
    ),
  });
}

export const env = parseEnvironment(process.env);
