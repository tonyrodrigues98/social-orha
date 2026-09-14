import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const requiredTransactionalGates = [
  "supabase-analytics-consent-integration.sql",
  "supabase-notification-integration.sql",
  "supabase-onboarding-integration.sql",
  "supabase-rate-limit-integration.sql",
  "supabase-rls-integration.sql",
  "supabase-role-management-integration.sql",
  "supabase-support-integration.sql",
] as const;

function integrationGateNames(): string[] {
  return readdirSync(path.resolve("scripts"))
    .filter((name) => /^supabase-.*-integration\.sql$/.test(name))
    .sort();
}

describe("Supabase transactional integration gates", () => {
  it("keeps every required remote gate versioned", () => {
    expect(integrationGateNames()).toEqual([...requiredTransactionalGates].sort());
  });

  it.each(requiredTransactionalGates)("keeps %s rollback-only and serialized", (name) => {
    const source = readFileSync(path.resolve("scripts", name), "utf8");

    expect(source).toMatch(/^begin;$/m);
    expect(source).toContain("pg_advisory_xact_lock");
    expect(source).not.toMatch(/^commit;$/m);
    expect(source.trimEnd()).toMatch(/rollback;$/);
  });

  it.each([
    "supabase-notification-integration.sql",
    "supabase-rate-limit-integration.sql",
    "supabase-rls-integration.sql",
    "supabase-role-management-integration.sql",
    "supabase-support-integration.sql",
  ])("creates the profiles in %s through authoritative onboarding", (name) => {
    const source = readFileSync(path.resolve("scripts", name), "utf8");
    const fixtureStart = source.indexOf("update public.profiles");
    const authoritativeCompletion = source.indexOf(
      "public.complete_own_onboarding()",
      fixtureStart,
    );
    const fixtureSetup = source.slice(fixtureStart, authoritativeCompletion);

    expect(fixtureStart).toBeGreaterThanOrEqual(0);
    expect(authoritativeCompletion).toBeGreaterThan(fixtureStart);
    expect(fixtureSetup).not.toMatch(/onboarding_completed_at\s*=/i);
  });
});
