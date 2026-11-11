import { describe, expect, it } from "vitest";
import { getPrRankMessage } from "@/lib/pr-celebration";

describe("PR celebration rank message", () => {
  it("shows upward rank movement", () => {
    expect(getPrRankMessage(7, 5)).toBe("You moved from #7 to #5.");
  });

  it("handles a first leaderboard entry", () => {
    expect(getPrRankMessage(null, 12)).toBe("You entered the leaderboard at #12.");
  });

  it("handles an unchanged position", () => {
    expect(getPrRankMessage(5, 5)).toBe("You held your #5 spot.");
  });

  it("handles missing rank data without inventing a position", () => {
    expect(getPrRankMessage(7, null)).toBe("Your new PR is on REPUNIT.");
  });
});
