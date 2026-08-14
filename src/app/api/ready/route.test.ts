import { describe, expect, it } from "vitest";

import { isWithinFreshnessWindow } from "@/app/api/ready/route";

describe("readiness freshness window", () => {
  const now = Date.parse("2026-08-14T09:00:00.000Z");

  it("accepts recent data and a small clock skew", () => {
    expect(
      isWithinFreshnessWindow(
        "2026-08-14T08:30:00.000Z",
        60 * 60_000,
        now,
      ),
    ).toBe(true);
    expect(
      isWithinFreshnessWindow(
        "2026-08-14T09:04:00.000Z",
        60 * 60_000,
        now,
      ),
    ).toBe(true);
  });

  it("rejects stale, invalid, and materially future-dated data", () => {
    expect(
      isWithinFreshnessWindow(
        "2026-08-14T07:59:59.000Z",
        60 * 60_000,
        now,
      ),
    ).toBe(false);
    expect(isWithinFreshnessWindow("invalid", 60 * 60_000, now)).toBe(false);
    expect(
      isWithinFreshnessWindow(
        "2026-08-14T09:06:00.000Z",
        60 * 60_000,
        now,
      ),
    ).toBe(false);
  });
});
