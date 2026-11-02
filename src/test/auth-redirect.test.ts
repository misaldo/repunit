import { describe, expect, it } from "vitest";
import { safeAuthPath } from "@/lib/auth-redirect";

describe("sign-in destination", () => {
  const origin = "https://repunit.example";
  it("preserves an intended crew destination", () => {
    expect(safeAuthPath("/crews/new", origin)).toBe("/crews/new");
  });
  it("rejects external destinations", () => {
    expect(safeAuthPath("//attacker.example/steal", origin)).toBe("/dashboard");
    expect(safeAuthPath("https://attacker.example", origin)).toBe("/dashboard");
  });
  it("prevents returning to sign-in again", () => {
    expect(safeAuthPath("/auth?redirect=/auth", origin)).toBe("/dashboard");
  });
});