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
    expect(LEVELS.map((level) => level.strengthTargetKg)).toEqual([0, 90, 110, 130, 150, 190, 230]);
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
