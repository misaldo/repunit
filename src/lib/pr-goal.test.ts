import { describe, expect, it } from "vitest";
import { getPrGoalProgress } from "./pr-goal";

describe("getPrGoalProgress", () => {
  it("starts with two genuine PR breakthroughs remaining", () => {
    expect(getPrGoalProgress(0)).toEqual({ count: 0, target: 2, remaining: 2, complete: false });
  });

  it("tracks one of the two required PR breakthroughs", () => {
    expect(getPrGoalProgress(1)).toEqual({ count: 1, target: 2, remaining: 1, complete: false });
  });

  it("completes the milestone at two PR breakthroughs", () => {
    expect(getPrGoalProgress(2)).toEqual({ count: 2, target: 2, remaining: 0, complete: true });
  });

  it("caps the displayed progress and handles invalid counts", () => {
    expect(getPrGoalProgress(9).count).toBe(2);
    expect(getPrGoalProgress(Number.NaN).count).toBe(0);
  });
});
