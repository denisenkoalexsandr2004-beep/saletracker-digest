import { describe, expect, it } from "vitest";

import { parseEnvironment } from "@/shared/config/env";

describe("environment configuration", () => {
  it("treats blank Vercel variables as absent and applies defaults", () => {
    const parsed = parseEnvironment({
      APP_URL: " ",
      NEWS_AI_PROVIDER: "",
      OPENAI_NEWS_MODEL: "",
      PERPLEXITY_NEWS_MODEL: " ",
      DB_POOL_SIZE: " ",
      NEWS_INGESTION_MAX_AGE_MINUTES: "",
      NEWS_APPROVED_SOURCE_MAX_AGE_HOURS: " ",
      NEWS_PROCESSING_BATCH_SIZE: "",
      NEWS_PROCESSING_CONCURRENCY: " ",
      NEWS_PROCESSING_MAX_ATTEMPTS: "",
      NEWS_PROCESSING_RETRY_DELAY_MS: " ",
      NEWS_PROCESSING_LEASE_MINUTES: "",
      NEWS_DEAD_LETTER_RETRY_HOURS: "",
      NEWS_DEAD_LETTER_REQUEUE_BATCH_SIZE: "",
      NEWS_AUTO_APPROVE: "",
      NEWS_AUTO_APPROVE_MIN_CONFIDENCE: "",
      DIGEST_DISPATCH_BATCH_SIZE: "",
    });

    expect(parsed.APP_URL).toBe("http://localhost:3000");
    expect(parsed.NEWS_AI_PROVIDER).toBe("openai");
    expect(parsed.OPENAI_NEWS_MODEL).toBe("gpt-5.6-luna");
    expect(parsed.PERPLEXITY_NEWS_MODEL).toBe("sonar");
    expect(parsed.DB_POOL_SIZE).toBe(5);
    expect(parsed.NEWS_INGESTION_MAX_AGE_MINUTES).toBe(150);
    expect(parsed.NEWS_APPROVED_SOURCE_MAX_AGE_HOURS).toBe(48);
    expect(parsed.NEWS_PROCESSING_BATCH_SIZE).toBe(8);
    expect(parsed.NEWS_PROCESSING_CONCURRENCY).toBe(3);
    expect(parsed.NEWS_PROCESSING_MAX_ATTEMPTS).toBe(3);
    expect(parsed.NEWS_PROCESSING_RETRY_DELAY_MS).toBe(300_000);
    expect(parsed.NEWS_PROCESSING_LEASE_MINUTES).toBe(15);
    expect(parsed.NEWS_DEAD_LETTER_RETRY_HOURS).toBe(6);
    expect(parsed.NEWS_DEAD_LETTER_REQUEUE_BATCH_SIZE).toBe(24);
    expect(parsed.NEWS_AUTO_APPROVE).toBe(true);
    expect(parsed.NEWS_AUTO_APPROVE_MIN_CONFIDENCE).toBe(0.8);
    expect(parsed.DIGEST_DISPATCH_BATCH_SIZE).toBe(6);
  });

  it("still rejects a non-empty invalid value", () => {
    expect(() =>
      parseEnvironment({ OPENAI_NEWS_MODEL: " ", DB_POOL_SIZE: "zero" }),
    ).toThrow();
  });

  it("accepts Perplexity as the feed analysis provider", () => {
    const parsed = parseEnvironment({
      NEWS_AI_PROVIDER: "perplexity",
      PERPLEXITY_API_KEY: "pplx-a-valid-test-key-value",
      PERPLEXITY_NEWS_MODEL: "sonar-pro",
    });

    expect(parsed.NEWS_AI_PROVIDER).toBe("perplexity");
    expect(parsed.PERPLEXITY_NEWS_MODEL).toBe("sonar-pro");
  });
});
