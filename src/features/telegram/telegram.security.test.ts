import { describe, expect, it } from "vitest";

import {
  getBearerToken,
  secureEquals,
} from "@/features/telegram/telegram.security";

describe("Telegram security helpers", () => {
  it("сравнивает секреты без допуска частичного совпадения", () => {
    expect(secureEquals("correct-secret", "correct-secret")).toBe(true);
    expect(secureEquals("correct", "correct-secret")).toBe(false);
    expect(secureEquals(undefined, "correct-secret")).toBe(false);
  });

  it("извлекает только Bearer-токен", () => {
    expect(
      getBearerToken(
        new Request("https://example.test", {
          headers: { Authorization: "Bearer admin-secret" },
        }),
      ),
    ).toBe("admin-secret");
    expect(
      getBearerToken(
        new Request("https://example.test", {
          headers: { Authorization: "Basic abc" },
        }),
      ),
    ).toBeNull();
  });
});
