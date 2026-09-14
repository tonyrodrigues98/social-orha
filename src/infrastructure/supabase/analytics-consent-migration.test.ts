import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("supabase/migrations/20260914104000_analytics_consent.sql"),
  "utf8",
);

describe("analytics consent migration", () => {
  it("keeps collection disabled by default and persists an explicit decision", () => {
    expect(migration).toMatch(/analytics_enabled boolean not null default false/i);
    expect(migration).toContain("analytics_consent_updated_at");
    expect(migration).toContain("user_settings_stamp_analytics_consent");
  });

  it("lets authenticated owners change only the consent flag", () => {
    expect(migration).toMatch(/grant update \(analytics_enabled\).*user_settings to authenticated/is);
    expect(migration).toMatch(/has_column_privilege\([\s\S]*analytics_consent_updated_at[\s\S]*UPDATE/is);
    expect(migration).toContain("authenticated must not write analytics_consent_updated_at directly");
  });
});
