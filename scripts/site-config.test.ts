import { describe, expect, it } from "vitest";
import {
  createSiteMetadata,
  normalizeAppBase,
  normalizePublicOrigin,
} from "./site-config";

describe("environment-driven site configuration", () => {
  it.each([
    [undefined, "/"],
    ["/", "/"],
    ["/social-orha", "/social-orha/"],
    [" /social-orha/ ", "/social-orha/"],
  ])("normalizes base %s to %s", (configured, expected) => {
    expect(normalizeAppBase(configured)).toBe(expected);
  });

  it.each(["social-orha", "//other-host/", "/bad\\path", "/bad?query", "/../private"])(
    "rejects unsafe base %s",
    (configured) => expect(() => normalizeAppBase(configured)).toThrow(),
  );

  it("accepts HTTPS production origins and localhost-only HTTP", () => {
    expect(normalizePublicOrigin("https://orha.example")).toBe("https://orha.example");
    expect(normalizePublicOrigin("http://127.0.0.1:4173")).toBe("http://127.0.0.1:4173");
    expect(() => normalizePublicOrigin("http://orha.example")).toThrow();
    expect(() => normalizePublicOrigin("https://orha.example/path")).toThrow();
  });

  it("derives Pages canonical and social image URLs from origin plus base", () => {
    expect(createSiteMetadata({
      appBase: "/social-orha/",
      publicOrigin: "https://tonyrodrigues98.github.io",
    })).toEqual(expect.objectContaining({
      canonicalUrl: "https://tonyrodrigues98.github.io/social-orha/",
      socialImageUrl: "https://tonyrodrigues98.github.io/social-orha/brand/orha-icon-512.png",
    }));
  });

  it("switches to a root custom domain without source changes", () => {
    expect(createSiteMetadata({
      appBase: "/",
      publicOrigin: "https://orha.example",
    })).toEqual(expect.objectContaining({
      canonicalUrl: "https://orha.example/",
      socialImageUrl: "https://orha.example/brand/orha-icon-512.png",
    }));
  });
});

