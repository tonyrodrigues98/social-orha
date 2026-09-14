import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    "supabase/migrations/20260914107000_report_snapshot_lint_hardening.sql",
  ),
  "utf8",
);

describe("report snapshot lint hardening migration", () => {
  it("keeps the row lock without assigning an unused report record", () => {
    expect(migration).toContain("perform 1");
    expect(migration).toContain("for update");
    expect(migration).not.toContain("report_record public.reports");
    expect(migration).not.toContain("into report_record");
  });

  it("preserves the private capture boundary and validates the replacement", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain(
      "from public, anon, authenticated, service_role",
    );
    expect(migration).toContain(
      "private.capture_report_target_snapshot(uuid,public.report_target_type,uuid,uuid)",
    );
  });
});
