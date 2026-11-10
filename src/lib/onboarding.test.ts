import { describe, expect, it } from "vitest";
import { isRecentlyCreatedAccount } from "@/lib/onboarding";

describe("first-run OAuth account detection", () => {
  const now = Date.parse("2026-11-10T12:00:00.000Z");

  it("recognizes a newly-created Google account", () => {
    expect(isRecentlyCreatedAccount("2026-11-10T11:55:00.000Z", now)).toBe(true);
  });

  it("does not reopen onboarding for an older account", () => {
    expect(isRecentlyCreatedAccount("2026-11-10T10:00:00.000Z", now)).toBe(false);
  });

  it("rejects invalid or future creation timestamps", () => {
    expect(isRecentlyCreatedAccount("not-a-date", now)).toBe(false);
    expect(isRecentlyCreatedAccount("2026-11-10T12:01:00.000Z", now)).toBe(false);
    expect(isRecentlyCreatedAccount(null, now)).toBe(false);
  });

  it("respects the onboarding detection window", () => {
    expect(isRecentlyCreatedAccount("2026-11-10T11:44:59.000Z", now)).toBe(true);
    expect(isRecentlyCreatedAccount("2026-11-10T11:44:59.000Z", now, 15 * 60 * 1000 - 1)).toBe(false);
  });
});
