import { describe, expect, it } from "vitest";
import { validateMessagingSmokeTarget } from "./messaging-media-smoke";

describe("messaging-media staging smoke guards", () => {
  it("accepts only the exact linked ORHA staging origin", () => {
    expect(
      validateMessagingSmokeTarget(
        "https://bgeauxljwjbtbwpbzpoo.supabase.co/",
        "bgeauxljwjbtbwpbzpoo\n",
      ),
    ).toBe("https://bgeauxljwjbtbwpbzpoo.supabase.co");
    expect(() =>
      validateMessagingSmokeTarget(
        "https://iuaczhkfmwpyhtpdmuyt.supabase.co",
        "bgeauxljwjbtbwpbzpoo",
      ),
    ).toThrow("restricted to the linked ORHA staging project");
    expect(() =>
      validateMessagingSmokeTarget(
        "https://token@bgeauxljwjbtbwpbzpoo.supabase.co",
        "bgeauxljwjbtbwpbzpoo",
      ),
    ).toThrow("restricted to the linked ORHA staging project");
  });
});
