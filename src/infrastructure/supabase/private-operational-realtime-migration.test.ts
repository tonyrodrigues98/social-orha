import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    "supabase/migrations/20260914106000_private_operational_realtime_channels.sql",
  ),
  "utf8",
);

describe("private operational Realtime channel migration", () => {
  it("authorizes only the authenticated user's notification and support topics", () => {
    expect(migration).toContain(
      "on realtime.messages for select to authenticated",
    );
    expect(migration).toContain("extension in ('broadcast', 'presence')");
    expect(migration).toContain(
      "private.account_access_enabled((select auth.uid()))",
    );
    expect(migration).toContain(
      "'notifications:' || (select auth.uid())::text",
    );
    expect(migration).toContain("'support:' || (select auth.uid())::text");
  });

  it("does not grant clients write access to operational topics", () => {
    expect(migration).not.toMatch(/on realtime\.messages for insert/i);
    expect(migration).not.toMatch(/grant\s+insert/i);
    expect(migration).toContain("from pg_policies");
  });
});
