import { describe, expect, it, vi } from "vitest";
import type { PostHog } from "posthog-js";
import { DisabledAnalyticsAdapter } from "./analytics-port";
import { PostHogAnalyticsAdapter, createAnalyticsAdapter } from "./posthog-analytics-adapter";

function fakePostHog() {
  return {
    init: vi.fn(),
    reset: vi.fn(),
    opt_in_capturing: vi.fn(),
    opt_out_capturing: vi.fn(),
    identify: vi.fn(),
    capture: vi.fn(),
  } as unknown as PostHog;
}

describe("PostHogAnalyticsAdapter", () => {
  it("does not load the SDK until persisted consent is granted", async () => {
    const client = fakePostHog();
    const importer = vi.fn(async () => ({ default: client }));
    const adapter = new PostHogAnalyticsAdapter(
      { projectKey: "ph_test", apiHost: "https://analytics.example.test" },
      importer,
    );

    await expect(adapter.setConsent(false, "user-1")).resolves.toBe(false);
    adapter.track("orha_page_view", { route_id: "/inicio" });
    expect(importer).not.toHaveBeenCalled();
    expect(client.capture).not.toHaveBeenCalled();
  });

  it("opts in before identifying and only sends allowlisted properties", async () => {
    const client = fakePostHog();
    const adapter = new PostHogAnalyticsAdapter(
      { projectKey: "ph_test", apiHost: "https://analytics.example.test" },
      async () => ({ default: client }),
    );

    await adapter.setConsent(true, "user-1");
    adapter.track("orha_page_view", {
      route_id: "/conversas/$conversationId",
      body: "must never leave the device",
    });
    await Promise.resolve();

    expect(client.reset).toHaveBeenCalledBefore(client.opt_in_capturing as ReturnType<typeof vi.fn>);
    expect(client.identify).toHaveBeenCalledWith("user-1");
    expect(client.capture).toHaveBeenCalledWith("orha_page_view", {
      route_id: "/conversas/$conversationId",
    });
  });

  it("resets identity and opts out when consent is revoked", async () => {
    const client = fakePostHog();
    const adapter = new PostHogAnalyticsAdapter(
      { projectKey: "ph_test", apiHost: "https://analytics.example.test" },
      async () => ({ default: client }),
    );
    await adapter.setConsent(true, "user-1");
    await adapter.setConsent(false, "user-1");

    expect(adapter.enabled).toBe(false);
    expect(client.opt_out_capturing).toHaveBeenCalledOnce();
  });

  it("stays disabled without complete HTTPS service configuration", () => {
    expect(createAnalyticsAdapter({})).toBeInstanceOf(DisabledAnalyticsAdapter);
    expect(createAnalyticsAdapter({
      VITE_ORHA_POSTHOG_KEY: "ph_test",
      VITE_ORHA_POSTHOG_HOST: "http://analytics.example.test",
    })).toBeInstanceOf(DisabledAnalyticsAdapter);
  });
});
