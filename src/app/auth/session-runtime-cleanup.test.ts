import { describe, expect, it, vi } from "vitest";
import {
  clearRuntimeOnAuthPrincipalChange,
  type AuthenticatedRuntimeCleanup,
} from "./session-runtime-cleanup";

function cleanupSpies(): AuthenticatedRuntimeCleanup {
  return {
    clearQueryCache: vi.fn(),
    revokeObjectUrls: vi.fn(),
    removeRealtimeChannels: vi.fn().mockResolvedValue(undefined),
  };
}

describe("authenticated runtime cleanup", () => {
  it("preserves cache and subscriptions for repeated events from the same user", () => {
    const cleanup = cleanupSpies();

    expect(
      clearRuntimeOnAuthPrincipalChange("user-a", "user-a", cleanup),
    ).toBe(false);
    expect(cleanup.clearQueryCache).not.toHaveBeenCalled();
    expect(cleanup.revokeObjectUrls).not.toHaveBeenCalled();
    expect(cleanup.removeRealtimeChannels).not.toHaveBeenCalled();
  });

  it.each([
    [null, "user-a"],
    ["user-a", "user-b"],
    ["user-a", null],
  ])("clears all scoped resources when %s becomes %s", (previous, next) => {
    const cleanup = cleanupSpies();

    expect(clearRuntimeOnAuthPrincipalChange(previous, next, cleanup)).toBe(true);
    expect(cleanup.clearQueryCache).toHaveBeenCalledOnce();
    expect(cleanup.revokeObjectUrls).toHaveBeenCalledOnce();
    expect(cleanup.removeRealtimeChannels).toHaveBeenCalledOnce();
  });
});
