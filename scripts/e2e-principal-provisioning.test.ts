import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { assertE2EPrincipalProvisioning } from "../e2e/support/supabase-admin";

type Result = { data: Record<string, unknown> | null; error: Error | null };

function clientFor(profile: Result, role: Result): SupabaseClient {
  return {
    from(table: string) {
      const result = table === "profiles" ? profile : role;
      return {
        select() {
          return {
            eq() {
              return {
                single: async () => result,
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
}

describe("E2E named-principal provisioning", () => {
  it("accepts a completed account with the exact backend role", async () => {
    const client = clientFor(
      { data: { onboarding_completed_at: "2026-09-14T12:00:00Z" }, error: null },
      { data: { role: "moderator" }, error: null },
    );

    await expect(
      assertE2EPrincipalProvisioning(client, "moderator", "fixture-id"),
    ).resolves.toBeUndefined();
  });

  it("rejects an incomplete onboarding profile", async () => {
    const client = clientFor(
      { data: { onboarding_completed_at: null }, error: null },
      { data: { role: "user" }, error: null },
    );

    await expect(
      assertE2EPrincipalProvisioning(client, "user-a", "fixture-id"),
    ).rejects.toThrow("onboarding concluído");
  });

  it("rejects privilege drift instead of trusting the configured account name", async () => {
    const client = clientFor(
      { data: { onboarding_completed_at: "2026-09-14T12:00:00Z" }, error: null },
      { data: { role: "user" }, error: null },
    );

    await expect(
      assertE2EPrincipalProvisioning(client, "admin", "fixture-id"),
    ).rejects.toThrow("exatamente o papel admin");
  });
});
