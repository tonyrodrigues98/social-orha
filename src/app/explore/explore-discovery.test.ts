import { describe, expect, it } from "vitest";
import { profileInitials } from "./explore-presentation";

describe("Explore discovery presentation", () => {
  it("creates deterministic initials without synthetic profile data", () => {
    expect(profileInitials("Ana Clara Rodrigues")).toBe("AC");
    expect(profileInitials("Lucas")).toBe("L");
  });
});
