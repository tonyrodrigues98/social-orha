import { describe, expect, it, vi } from "vitest";
import { auditHostCapabilities } from "./host-capability-audit";

function response(status: number, contentType = "text/html; charset=utf-8") {
  return new Response("", { status, headers: { "content-type": contentType } });
}

describe("production host capability audit", () => {
  it("approves only a host that serves the app shell with HTTP 200 on every direct route", async () => {
    const fetcher = vi.fn(async () => response(200));
    const result = await auditHostCapabilities({
      hostUrl: "https://orha.example/",
      deepLinks: ["/auth/login", "/conversas/conversation-id"],
      fetcher,
    });

    expect(result.rewriteCapable).toBe(true);
    expect(result.deepLinks.map((item) => item.url)).toEqual([
      "https://orha.example/auth/login",
      "https://orha.example/conversas/conversation-id",
    ]);
  });

  it("keeps GitHub Pages-style HTTP 404 deep links visible as a release blocker", async () => {
    const fetcher = vi.fn(async (request: string | URL | Request) => {
      const path = new URL(String(request)).pathname;
      return response(path === "/social-orha/" ? 200 : 404);
    });
    const result = await auditHostCapabilities({
      hostUrl: "https://tonyrodrigues98.github.io/social-orha/",
      deepLinks: ["/auth/login", "/perfil/orha-host-gate"],
      fetcher,
    });

    expect(result.root.status).toBe(200);
    expect(result.deepLinks.map((item) => item.status)).toEqual([404, 404]);
    expect(result.rewriteCapable).toBe(false);
  });

  it("does not mistake a non-HTML 200 response for an SPA rewrite", async () => {
    const result = await auditHostCapabilities({
      hostUrl: "https://orha.example/",
      deepLinks: ["/auth/login"],
      fetcher: async () => response(200, "application/json"),
    });
    expect(result.rewriteCapable).toBe(false);
  });
});

