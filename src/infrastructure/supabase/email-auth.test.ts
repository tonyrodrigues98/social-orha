import { describe, expect, it } from "vitest";
import { getAuthRedirectUrl } from "./email-auth";

describe("getAuthRedirectUrl", () => {
  it("preserves the Vite base path used by GitHub Pages", () => {
    expect(
      getAuthRedirectUrl(
        "https://tonyrodrigues98.github.io",
        "/social-orha/",
      ),
    ).toBe("https://tonyrodrigues98.github.io/social-orha/");
  });

  it("keeps the development app at the origin root", () => {
    expect(getAuthRedirectUrl("http://localhost:5173/", "/")).toBe(
      "http://localhost:5173/",
    );
  });
});
