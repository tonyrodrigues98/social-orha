import { describe, expect, it } from "vitest";
import { brazilianStates } from "./brazil-locations";

describe("Brazil location catalog", () => {
  it("contains all 26 states and Distrito Federal exactly once", () => {
    expect(brazilianStates).toHaveLength(27);
    expect(new Set(brazilianStates.map(([code]) => code)).size).toBe(27);
    expect(brazilianStates).toContainEqual(["DF", "Distrito Federal"]);
  });
});
