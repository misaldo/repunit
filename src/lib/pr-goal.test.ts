import { describe, expect, it } from "vitest";
import { getPrGoalProgress } from "./pr-goal";

describe("getPrGoalProgress", () => {
  it("starts with two new PR breakthroughs remaining from the saved baseline", () => {
    expect(getPrGoalProgress(8, 8)).toEqual({ count: 0, target: 2, remaining: 2, complete: false });
  });

  it("tracks one new PR after the baseline", () => {
    expect(getPrGoalProgress(9, 8)).toEqual({ count: 1, target: 2, remaining: 1, complete: false });
  });

  it("completes the milestone after two new PR breakthroughs", () => {
    expect(getPrGoalProgress(10, 8)).toEqual({ count: 2, target: 2, remaining: 0, complete: true });
  });

  it("caps displayed progress and handles invalid counts", () => {
    expect(getPrGoalProgress(20, 8).count).toBe(2);
    expect(getPrGoalProgress(Number.NaN, 0).count).toBe(0);
  });
});
