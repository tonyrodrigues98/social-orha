import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260816180000_edge_worker_contracts.sql"),
  "utf8",
);

describe("Edge worker database hardening", () => {
  it("keeps export artifacts private, expiring, and protected by RLS", () => {
    expect(migration).toContain("create table public.account_export_artifacts");
    expect(migration).toContain("alter table public.account_export_artifacts enable row level security");
    expect(migration).toContain("'account-exports',\n  'account-exports',\n  false");
    expect(migration).toContain("expires_at <= timezone('utc', now())");
  });

  it("keeps lifecycle queue mutations service-role-only and recoverable", () => {
    expect(migration).toContain("for update skip locked");
    expect(migration).toContain("account_deletion_tombstones");
    expect(migration).toContain("public.record_account_deletion_completed(uuid, uuid, integer) to service_role");
    expect(migration).toContain("from public, anon, authenticated");
  });

  it("removes browser promotion and Storage overwrite bypasses", () => {
    expect(migration).toContain("revoke all on function public.finalize_profile_media(uuid) from authenticated");
    expect(migration).toContain("revoke all on function public.finalize_post_media(uuid) from authenticated");
    expect(migration).toContain('drop policy if exists "ORHA owners can update their media" on storage.objects');
    expect(migration).toContain('create policy "ORHA owners can delete orphaned uploads"');
    expect(migration).toContain("send_validated_message_media");
    expect(migration).not.toContain("create or replace function public.attach_validated_message_media");
    expect(migration).toContain("where id = 'chat-media';");
    expect(migration).toContain("'application/pdf' = any(allowed_mime_types)");
  });

  it("captures immutable moderation context and retains only its authorized media references", () => {
    expect(migration).toContain("add column target_snapshot jsonb");
    expect(migration).toContain("create table public.report_target_attachments");
    expect(migration).toContain("create trigger reports_target_snapshot_immutable");
    expect(migration).toContain("private.capture_report_target_snapshot(");
    expect(migration).toContain("report_record.target_snapshot->>'content_text'");
    expect(migration).toContain("private.report_target_attachment_is_retained(");
    expect(migration).toContain("and not private.report_target_attachment_is_retained(object.bucket_id, object.name)");
    expect(migration).toContain("revoke select on public.reports from authenticated");
    expect(migration).toContain("has_column_privilege('authenticated', 'public.reports', 'target_snapshot', 'SELECT')");
  });

  it("reconciles cleanup claims after an object was deleted but completion was interrupted", () => {
    expect(migration).toContain("public.list_orphan_media_cleanup_reconciliation");
    expect(migration).toContain("where not exists (\n    select 1 from storage.objects as object");
  });
});
