import { describe, expect, it } from "vitest";
import { getLevel, LEVELS } from "@/lib/progression";

describe("REPUNIT personal progression", () => {
  it("keeps the seven level names in order", () => {
    expect(LEVELS.map((level) => level.name)).toEqual([
      "Foam",
      "Tin",
      "Brass",
      "Iron",
      "Tungsten",
      "Osmium",
      "Neutron Star",
    ]);
  });

  it("uses the agreed verified-PR targets for each level", () => {
    expect(LEVELS.map((level) => level.strengthTargets)).toEqual([
      { bench: 0, squat: 0, deadlift: 0 },
      { bench: 60, squat: 80, deadlift: 100 },
      { bench: 80, squat: 110, deadlift: 130 },
      { bench: 100, squat: 140, deadlift: 160 },
      { bench: 120, squat: 170, deadlift: 190 },
      { bench: 140, squat: 200, deadlift: 220 },
      { bench: 160, squat: 230, deadlift: 250 },
    ]);
  });

  it("selects the next XP level at each boundary", () => {
    expect(getLevel(99).next?.name).toBe("Tin");
    expect(getLevel(100).next?.name).toBe("Brass");
    expect(getLevel(300).next?.name).toBe("Iron");
    expect(getLevel(700).next?.name).toBe("Tungsten");
    expect(getLevel(1500).next?.name).toBe("Osmium");
    expect(getLevel(3000).next?.name).toBe("Neutron Star");
    expect(getLevel(6000).next).toBeUndefined();
  });
});
