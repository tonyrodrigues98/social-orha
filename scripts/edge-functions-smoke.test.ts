import { describe, expect, it, vi } from "vitest";
import { runAnonymousEdgeFunctionSmoke } from "./edge-functions-smoke";

function response(status: number, headers?: Record<string, string>): Response {
  return new Response(null, { status, headers });
}

describe("Edge Functions anonymous smoke", () => {
  it("accepts protected functions and an exact CORS allowlist", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
      if (init?.method === "POST") return response(401);
      const origin = new Headers(init?.headers).get("origin");
      return origin === "http://127.0.0.1:5173"
        ? response(204, { "access-control-allow-origin": origin })
        : response(403);
    });

    await expect(runAnonymousEdgeFunctionSmoke({
      baseUrl: "https://staging.example/functions/v1",
      allowedOrigin: "http://127.0.0.1:5173",
      fetcher,
    })).resolves.toEqual({ checks: 7, failures: [] });
    expect(fetcher).toHaveBeenCalledTimes(7);
  });

  it("reports every unexpected status without reading response bodies", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response(500, {
      "access-control-allow-origin": "https://orha-invalid-origin.example",
    }));

    const result = await runAnonymousEdgeFunctionSmoke({
      baseUrl: "https://staging.example/functions/v1/",
      allowedOrigin: "https://preview.example",
      fetcher,
    });

    expect(result.checks).toBe(7);
    expect(result.failures).toHaveLength(7);
  });

  it("rejects a base URL that could embed credentials", async () => {
    await expect(runAnonymousEdgeFunctionSmoke({
      baseUrl: "https://token@staging.example/functions/v1/",
      allowedOrigin: "https://preview.example",
      fetcher: vi.fn<typeof fetch>(),
    })).rejects.toThrow("credential-free HTTPS URL");
  });
});
