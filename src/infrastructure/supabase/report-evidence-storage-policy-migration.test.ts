import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    "supabase/migrations/20260914105000_report_evidence_storage_authorization.sql",
  ),
  "utf8",
);

describe("report-evidence Storage authorization migration", () => {
  it("keeps pending evidence private while authorizing only its reporter upload", () => {
    expect(migration).toContain(
      `private.can_upload_report_evidence(
  p_object_path text,
  p_actor_id uuid`,
    );
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("p_actor_id = auth.uid()");
    expect(migration).toContain("evidence.status = 'pending'");
    expect(migration).toContain("report.reporter_id = p_actor_id");
    expect(migration).toContain(
      "private.can_upload_report_evidence(name, (select auth.uid()))",
    );
  });

  it("uses minimal callable grants and verifies the installed policy", () => {
    expect(migration).toContain(
      "revoke all on function private.can_upload_report_evidence(text, uuid)",
    );
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to authenticated, service_role");
    expect(migration).toContain("from pg_policies");
    expect(migration).toContain(
      "with_check like '%can_upload_report_evidence%'",
    );
  });
});
