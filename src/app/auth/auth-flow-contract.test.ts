import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./auth-flow.tsx", import.meta.url), "utf8");

describe("launch authentication surface", () => {
  it("does not expose OAuth controls until a real provider is configured", () => {
    expect(source).not.toContain("Continuar com Google");
    expect(source).not.toContain("signInWithOAuth");
    expect(source).not.toContain("será ativada em breve");
  });

  it("never introduces Apple Sign-In", () => {
    expect(source).not.toMatch(/Apple\s*(Sign[- ]?In|Login)|Continuar com Apple/i);
  });
});
