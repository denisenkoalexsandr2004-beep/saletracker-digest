import { describe, expect, it } from "vitest";

import {
  createAdminSessionToken,
  verifyAdminSessionToken,
} from "@/features/admin/admin-auth";

describe("admin session", () => {
  it("принимает подписанную сессию и отклоняет подменённую", () => {
    const now = Date.parse("2026-08-13T09:00:00.000Z");
    const token = createAdminSessionToken("a".repeat(32), now);

    expect(verifyAdminSessionToken(token, "a".repeat(32), now + 1_000)).toBe(
      true,
    );
    expect(verifyAdminSessionToken(`${token}x`, "a".repeat(32), now)).toBe(
      false,
    );
  });

  it("отклоняет истёкшую сессию", () => {
    const now = Date.parse("2026-08-13T09:00:00.000Z");
    const token = createAdminSessionToken("b".repeat(32), now);

    expect(
      verifyAdminSessionToken(token, "b".repeat(32), now + 9 * 60 * 60 * 1_000),
    ).toBe(false);
  });
});
