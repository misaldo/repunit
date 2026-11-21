import { describe, expect, it } from "vitest";
import { getPrRankMessage } from "./pr-celebration";

describe("getPrRankMessage", () => {
  it("announces an improved leaderboard position", () => {
    expect(getPrRankMessage(7, 5)).toBe("You moved from #7 to #5.");
  });

  it("announces a first leaderboard entry", () => {
    expect(getPrRankMessage(null, 12)).toBe("You entered the leaderboard at #12.");
  });

  it("handles a missing new rank without inventing a position", () => {
    expect(getPrRankMessage(7, null)).toBe("Your new PR is on REPUNIT.");
  });

  it("confirms when the lifter holds the same position", () => {
    expect(getPrRankMessage(5, 5)).toBe("You held your #5 spot.");
  });

  it("reports the current position when the rank does not improve", () => {
    expect(getPrRankMessage(5, 7)).toBe("Your current rank is #7.");
  });
});
