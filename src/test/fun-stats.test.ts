import { describe, expect, it } from "vitest";
import { formatLiftVolume, getFunComparison } from "@/components/fun-stats";

describe("REPUNIT fun lift statistics", () => {
  it("formats invalid or non-positive volume safely", () => {
    expect(formatLiftVolume(0)).toBe("0 kg");
    expect(formatLiftVolume(-25)).toBe("0 kg");
    expect(formatLiftVolume(Number.NaN)).toBe("0 kg");
  });

  it("formats kilogram and ton values consistently", () => {
    expect(formatLiftVolume(850)).toBe("850 kg");
    expect(formatLiftVolume(2500)).toBe("2.5 tons");
  });

  it("returns no comparison for invalid or non-positive volume", () => {
    expect(getFunComparison(0)).toBeNull();
    expect(getFunComparison(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("returns a stable comparison with a positive count", () => {
    const comparison = getFunComparison(10_000, 0);
    expect(comparison).not.toBeNull();
    expect(comparison?.count).toBeGreaterThan(0);
    expect(comparison?.label).toContain(comparison?.name ?? "");
  });

  it("supports negative rotation indexes without breaking", () => {
    const comparison = getFunComparison(10_000, -1);
    expect(comparison).not.toBeNull();
    expect(comparison?.count).toBeGreaterThan(0);
  });
});
