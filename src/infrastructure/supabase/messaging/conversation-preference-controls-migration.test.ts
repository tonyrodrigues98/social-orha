import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260816200000_conversation_preference_controls.sql"),
  "utf8",
);
const edgeMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260816180000_edge_worker_contracts.sql"),
  "utf8",
);
const integration = readFileSync(
  resolve(process.cwd(), "scripts/supabase-rls-integration.sql"),
  "utf8",
);
const validation = readFileSync(
  resolve(process.cwd(), "scripts/supabase-validate.sql"),
  "utf8",
);

function section(startMarker: string, endMarker: string): string {
  const start = migration.indexOf(startMarker);
  const end = migration.indexOf(endMarker, start + startMarker.length);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end);
}

describe("per-user conversation controls", () => {
  it("persists favorite and a monotonic clear watermark through identity-bound RPCs", () => {
    expect(migration).toContain("add column if not exists favorited_at timestamptz");
    expect(migration).toContain("add column if not exists cleared_before timestamptz");
    expect(migration).toContain("create or replace function public.set_conversation_favorite(");
    expect(migration).toContain("create or replace function public.clear_conversation_for_me(");
    expect(migration).toContain("greatest(");
    expect(migration).toContain("new.cleared_before < old.cleared_before");
    expect(migration).toContain("not private.is_socially_active(actor_id)");
    expect(migration).toContain("not private.is_conversation_member(p_conversation_id, actor_id, false)");
    expect(migration).toContain("revoke update (favorited_at, cleared_before)");
    expect(migration).toContain("grant execute on function public.set_conversation_favorite(uuid, boolean)");
    expect(migration).toContain("grant execute on function public.clear_conversation_for_me(uuid)");
  });

  it("enforces cleared history on every message-derived read surface", () => {
    const visibility = section(
      "create or replace function private.can_view_message(",
      "create or replace function public.set_conversation_favorite(",
    );
    expect(visibility).toContain("private.is_socially_active(p_viewer_id)");
    expect(visibility).toContain("membership.status = 'active'");
    expect(visibility).toContain("message.created_at > preference.cleared_before");

    for (const policy of [
      'create policy "Active members can view messages"',
      'create policy "Active members can view message reactions"',
      'create policy "Active members can view message attachments"',
      'create policy "Conversation members can view receipts"',
    ]) {
      expect(migration).toContain(policy);
    }
    expect(migration.match(/using \(private\.can_view_message\(/g)?.length).toBeGreaterThanOrEqual(3);
    const storageVisibility = section(
      "create or replace function private.can_read_storage_object(",
      "-- New fields are RPC-only for browser users.",
    );
    expect(storageVisibility).toContain("persisted_attachment");
    expect(storageVisibility).toContain("and private.can_view_message(message.id, p_viewer_id)");
    expect(storageVisibility).not.toContain("public.reports");
    expect(edgeMigration).toContain("private.report_target_attachment_is_retained(bucket_id, name)");
  });

  it("preserves the trusted atomic-media boundary from the edge migration", () => {
    const persistence = section(
      "create or replace function private.persist_authoritative_message(",
      "create or replace function public.send_message(",
    );
    const browserSend = section(
      "create or replace function public.send_message(",
      "create or replace function public.edit_message(",
    );
    expect(persistence).toContain("pg_advisory_xact_lock");
    expect(persistence).toContain("private.can_view_message(reply.id, p_actor_id)");
    expect(persistence).toContain("message_created_at := clock_timestamp()");
    expect(browserSend).toContain("p_kind is distinct from 'text'::public.message_kind");
    expect(browserSend).toContain("private.persist_authoritative_message(");
    expect(browserSend).not.toContain("insert into public.messages");
    expect(migration).not.toContain("create or replace function public.attach_validated_message_media(");
    expect(migration).not.toContain("create or replace function public.send_validated_message_media(");
  });

  it("invalidates every device through private Realtime preferences", () => {
    expect(migration).toContain("alter publication supabase_realtime add table public.conversation_preferences");
    expect(validation).toContain("('conversation_preferences')");
    expect(validation).toContain("('public.set_conversation_favorite(uuid,boolean)')");
    expect(validation).toContain("('public.clear_conversation_for_me(uuid)')");
    expect(validation).toContain("('20260816200000')");
  });

  it("strengthens report authorization without replacing immutable snapshot capture", () => {
    const capture = section(
      "create or replace function private.capture_report_target_snapshot(",
      "-- Storage authorization is derived from visible attachment rows.",
    );
    expect(migration).not.toContain("create or replace function public.create_report(");
    expect(capture).toContain("private.can_view_profile(profile.id, p_actor_id)");
    expect(capture).toContain("community.archived_at is null");
    expect(capture).toContain("not private.is_blocked_between(community.owner_id, p_actor_id)");
    expect(capture).not.toContain("community.visibility");
    expect(capture).not.toContain("private.can_manage_community");
    expect(capture).not.toContain("private.is_active_community_member");
    expect(capture).toContain("private.can_view_community_post(post.id, p_actor_id)");
    expect(capture).toContain("private.can_view_message(message.id, p_actor_id)");
    expect(capture).toContain("target_snapshot = jsonb_build_object(");
    expect(capture).toContain("insert into public.report_target_attachments");
    expect(edgeMigration).toContain("drop function public.create_report(");
    expect(edgeMigration).toContain("create function public.create_report(");
    expect(edgeMigration).toContain("perform private.capture_report_target_snapshot(");
    expect(edgeMigration).toContain("target_snapshot");
    expect(edgeMigration).toContain(
      "revoke all on function public.create_report(public.report_target_type, uuid, text, text)",
    );
    expect(edgeMigration).toContain(
      "to authenticated, service_role;",
    );
  });

  it("covers multi-user isolation and rejected cleared-history operations", () => {
    expect(integration).toContain("outsider must not favorite another conversation");
    expect(integration).toContain("outsider must not clear another conversation");
    expect(integration).toContain("clear must advance only the current member watermark");
    expect(integration).toContain("cleared member must lose message, reaction, attachment, and receipt visibility together");
    expect(integration).toContain("cleared member must not recover old media through the private Storage policy");
    expect(integration).toContain("cleared member must not reply to cleared history");
    expect(integration).toContain("cleared member must not forward cleared history");
    expect(integration).toContain("cleared member must not update receipts for cleared history");
    expect(integration).toContain("cleared member must not report cleared history");
    expect(integration).toContain("messages created after clear must remain visible to the cleared member");
    expect(integration).toContain("one member clearing or favoriting must not change the other member history");
    expect(integration).toContain("authenticated clients must not create media messages before trusted byte validation");
  });
});
