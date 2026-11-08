import { describe, expect, it } from "vitest";
import { cosmeticForXp } from "@/lib/cosmetics";

describe("level cosmetics", () => {
  it("starts everyone on the first level", () => {
    expect(cosmeticForXp(0).levelName).toBe("Foam");
    expect(cosmeticForXp(undefined).levelName).toBe("Foam");
    expect(cosmeticForXp(-50).levelName).toBe("Foam");
  });

  it("unlocks the next frame exactly at the level threshold", () => {
    expect(cosmeticForXp(99).levelName).toBe("Foam");
    expect(cosmeticForXp(100).levelName).toBe("Tin");
    expect(cosmeticForXp(6000).levelName).toBe("Neutron Star");
  });

  it("gives every level its own frame", () => {
    const xpSteps = [0, 100, 300, 700, 1500, 3000, 6000];
    const frames = new Set(xpSteps.map((xp) => cosmeticForXp(xp).frameClass));
    expect(frames.size).toBe(xpSteps.length);
  });
});
