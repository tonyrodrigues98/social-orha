import { describe, expect, it } from "vitest";
import { validateSocialSmokeTarget } from "./social-domain-smoke";

describe("social-domain staging smoke guards", () => {
  it("accepts only the exact linked ORHA staging origin", () => {
    expect(
      validateSocialSmokeTarget(
        "https://bgeauxljwjbtbwpbzpoo.supabase.co/",
        "bgeauxljwjbtbwpbzpoo\n",
      ),
    ).toBe("https://bgeauxljwjbtbwpbzpoo.supabase.co");
    expect(() =>
      validateSocialSmokeTarget(
        "https://iuaczhkfmwpyhtpdmuyt.supabase.co",
        "bgeauxljwjbtbwpbzpoo",
      ),
    ).toThrow("restricted to the linked ORHA staging project");
    expect(() =>
      validateSocialSmokeTarget(
        "https://token@bgeauxljwjbtbwpbzpoo.supabase.co",
        "bgeauxljwjbtbwpbzpoo",
      ),
    ).toThrow("restricted to the linked ORHA staging project");
  });
});
