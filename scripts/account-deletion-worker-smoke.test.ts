import { describe, expect, it } from "vitest";
import { validateDeletionSmokeTarget } from "./account-deletion-worker-smoke";

describe("account-deletion worker smoke guards", () => {
  it("requires both URL and linked ref to be the exact ORHA staging project", () => {
    expect(
      validateDeletionSmokeTarget(
        "https://bgeauxljwjbtbwpbzpoo.supabase.co/",
        "bgeauxljwjbtbwpbzpoo\n",
      ),
    ).toBe("https://bgeauxljwjbtbwpbzpoo.supabase.co");
    expect(() =>
      validateDeletionSmokeTarget(
        "https://iuaczhkfmwpyhtpdmuyt.supabase.co",
        "bgeauxljwjbtbwpbzpoo",
      ),
    ).toThrow("restricted to the linked ORHA staging project");
    expect(() =>
      validateDeletionSmokeTarget(
        "https://bgeauxljwjbtbwpbzpoo.supabase.co",
        "iuaczhkfmwpyhtpdmuyt",
      ),
    ).toThrow("restricted to the linked ORHA staging project");
  });
});
