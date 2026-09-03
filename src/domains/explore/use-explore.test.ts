import { describe, expect, it } from "vitest";
import { normalizeExploreSearch } from "./use-explore";

describe("Explore query contract", () => {
  it("normalizes and caps terms before they reach the repository", () => {
    expect(normalizeExploreSearch("  cinema cristão  ")).toBe("cinema cristão");
    expect(normalizeExploreSearch("x".repeat(120))).toHaveLength(80);
  });
});
