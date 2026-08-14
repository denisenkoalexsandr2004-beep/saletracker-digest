import { describe, expect, it } from "vitest";

import { parseEnvironment } from "@/shared/config/env";

describe("environment configuration", () => {
  it("treats blank Vercel variables as absent and applies defaults", () => {
    const parsed = parseEnvironment({
      APP_URL: " ",
      OPENAI_NEWS_MODEL: "",
      DB_POOL_SIZE: " ",
      NEWS_INGESTION_MAX_AGE_MINUTES: "",
      NEWS_APPROVED_SOURCE_MAX_AGE_HOURS: " ",
    });

    expect(parsed.APP_URL).toBe("http://localhost:3000");
    expect(parsed.OPENAI_NEWS_MODEL).toBe("gpt-5.6-sol");
    expect(parsed.DB_POOL_SIZE).toBe(5);
    expect(parsed.NEWS_INGESTION_MAX_AGE_MINUTES).toBe(150);
    expect(parsed.NEWS_APPROVED_SOURCE_MAX_AGE_HOURS).toBe(48);
  });

  it("still rejects a non-empty invalid value", () => {
    expect(() =>
      parseEnvironment({ OPENAI_NEWS_MODEL: " ", DB_POOL_SIZE: "zero" }),
    ).toThrow();
  });
});
