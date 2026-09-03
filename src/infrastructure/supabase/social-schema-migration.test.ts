import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(
  testDirectory,
  "../../../supabase/migrations/20260816170000_social_launch_schema.sql",
);
const migration = fs.readFileSync(migrationPath, "utf8");
const validationPath = path.resolve(testDirectory, "../../../scripts/supabase-validate.sql");
const validation = fs.readFileSync(validationPath, "utf8");
const hardeningAuditPath = path.resolve(
  testDirectory,
  "../../../scripts/supabase-hardening-audit.sql",
);
const hardeningAudit = fs.readFileSync(hardeningAuditPath, "utf8");
const rlsIntegrationPath = path.resolve(
  testDirectory,
  "../../../scripts/supabase-rls-integration.sql",
);
const rlsIntegration = fs.readFileSync(rlsIntegrationPath, "utf8");

function section(start: string, end: string) {
  const startIndex = migration.indexOf(start);
  const endIndex = migration.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return migration.slice(startIndex, endIndex);
}

const launchTables = [
  "profile_moderation_state",
  "notification_preferences",
  "user_settings",
  "account_lifecycle_requests",
  "blocks",
  "profile_media",
  "communities",
  "community_memberships",
  "community_rules",
  "community_posts",
  "post_media",
  "post_comments",
  "post_reactions",
  "conversations",
  "conversation_members",
  "conversation_preferences",
  "conversation_requests",
  "messages",
  "message_reactions",
  "message_attachments",
  "message_receipts",
  "notifications",
  "reports",
  "report_evidence",
  "moderation_cases",
  "sanctions",
  "audit_logs",
] as const;

describe("ORHA social launch migration", () => {
  it("uses domain-specific launch tables and enables RLS on all of them", () => {
    for (const table of launchTables) {
      expect(migration).toContain(`create table public.${table}`);
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }

    expect(migration).not.toMatch(/create table public\.(posts|comments|reactions|user_blocks)\b/);
    expect(migration).not.toContain("create table public.friendships");
    expect(migration).toContain("20260816130000_security_privacy_hardening.sql");
    expect(migration).toContain("Accepting a conversation request never creates friendship");
  });

  it("keeps browser writes narrow and audit fields immutable", () => {
    expect(migration).toContain("revoke all on table");
    expect(migration).toContain("from anon, authenticated");
    expect(migration).not.toMatch(/grant\s+(?:all|insert|update|delete)[\s\S]{0,120}\bto anon\b/i);

    const notificationGrant = section(
      "grant update (\n  social_enabled,",
      ") on public.notification_preferences to authenticated",
    );
    const postGrant = section(
      "grant insert (author_id, community_id, body, visibility)",
      "on public.community_posts to authenticated",
    );
    for (const grant of [notificationGrant, postGrant]) {
      expect(grant).not.toContain("created_at");
      expect(grant).not.toContain("updated_at");
      expect(grant).not.toContain("status");
    }

    expect(migration).toContain("Audit logs are append-only");
    expect(migration).toContain("create trigger audit_logs_are_append_only");
  });

  it("exposes privacy-aware search and enforces blocks without a follow model", () => {
    const search = section(
      "create or replace function public.search_visible_profiles(",
      "revoke all on function public.search_visible_profiles",
    );
    expect(search).toContain("private.is_blocked_between");
    expect(search).toContain("privacy.profile_visibility = 'friends'");
    expect(search).toContain("privacy.location_visibility = 'friends'");
    expect(search).toContain("privacy.favorites_visibility = 'friends'");
    expect(search).toContain("privacy.gallery_visibility = 'friends'");
    expect(search).not.toContain("birth_date");
    expect(search).toContain("limit least(greatest(coalesce(page_size, 20), 1), 50)");

    expect(migration).toContain("public.block_profile(p_target_profile_id uuid, p_reason text default null)");
    expect(migration).toContain("public.unblock_profile(p_target_profile_id uuid)");
    expect(migration).toContain("public.get_own_blocked_profile_by_username(p_username text)");
    expect(migration).toContain("block.blocker_id = (select auth.uid())");
    expect(migration).toContain("delete from public.friendships");
    expect(migration).not.toMatch(/create table public\.follows\b/);
  });

  it("persists indexed community categories without breaking existing create calls", () => {
    expect(migration).toContain("category text not null default 'general'");
    expect(migration).toContain("constraint communities_category_format");
    expect(migration).toContain("create index communities_category_visibility_idx");
    expect(migration).toContain("p_category text default 'general'");
    expect(migration).toContain("normalized_category text := lower(btrim(p_category))");
    expect(migration).toContain("public.get_community_discovery(p_community_id uuid)");
    expect(migration).toContain("active_member_count bigint");
    expect(migration).toContain("active_post_count bigint");
    expect(migration).toContain("private.is_socially_active(viewer.viewer_id)");
  });

  it("keeps community management and post media mutations server-authoritative", () => {
    for (const signature of [
      "public.update_community_details(",
      "public.archive_community(p_community_id uuid)",
      "public.upsert_community_rule(",
      "public.delete_community_rule(p_rule_id uuid)",
      "public.set_community_member_role(",
      "public.ban_community_member(",
      "public.unban_community_member(",
      "public.remove_community_post(p_post_id uuid)",
      "public.remove_post_comment(p_comment_id uuid)",
      "public.reserve_post_media(",
      "public.finalize_post_media(p_media_id uuid)",
      "public.remove_post_media(p_media_id uuid)",
      "public.list_post_media_cleanup(p_limit integer default 100)",
      "public.complete_post_media_cleanup(p_media_id uuid)",
    ]) {
      expect(migration).toContain(signature);
    }

    expect(migration).toContain("Only the active community owner can change member roles.");
    expect(migration).toContain("and role <> 'owner'");
    expect(migration).toContain("set role = 'member',\n      status = 'banned'");
    expect(migration).toContain("set role = 'member',\n      status = 'left'");
    expect(migration).toContain("constraint community_rules_order_unique unique (community_id, sort_order) deferrable");
    expect(migration).toContain("set constraints public.community_rules_order_unique deferred");
    expect(migration).toContain("status public.media_processing_status not null default 'pending'");
    expect(migration).toContain("post_media_post_order_active_unique");
    expect(migration).toContain("set status = 'deleting'");
    expect(migration).toContain("'/post/' || p_post_id::text");
    expect(migration).toContain("private.community_object_is_sanctioned");

    expect(migration).not.toMatch(
      /grant\s+update\s*\([^)]*\)\s*on public\.communities to authenticated/i,
    );
    expect(migration).not.toMatch(
      /grant\s+(?:insert|update|delete)[\s\S]{0,180}on public\.community_rules to authenticated/i,
    );
    expect(migration).not.toMatch(
      /grant\s+(?:insert|update|delete)[\s\S]{0,180}on public\.post_media to authenticated/i,
    );

    for (const signature of [
      "('public.update_community_details(uuid,text,text,text,public.community_visibility,text,text)')",
      "('public.archive_community(uuid)')",
      "('public.set_community_member_role(uuid,uuid,public.community_role)')",
      "('public.remove_community_post(uuid)')",
      "('public.reserve_post_media(uuid,text,text,bigint,integer,integer,smallint)')",
    ]) {
      expect(validation).toContain(signature);
    }

    expect(rlsIntegration).toContain("only the owner RPC must promote an active community member");
    expect(rlsIntegration).toContain("only the active owner must archive a community through the audited RPC");
    expect(rlsIntegration).toContain("community moderator must remove a community post through the audited RPC");
    expect(rlsIntegration).toContain("post media removal must deny reads before the trusted Storage cleanup");
  });

  it("matches the finalized profile media RPC and private Storage contract", () => {
    expect(migration).toContain("public.reserve_profile_media(\n  p_purpose public.profile_media_purpose");
    expect(migration).toContain("public.finalize_profile_media(p_media_id uuid)");
    expect(migration).toContain("public.remove_profile_media(p_media_id uuid)");
    expect(migration).toContain("public.reorder_profile_gallery(p_media_ids uuid[])");
    expect(migration).toContain("returns setof public.profile_media");
    expect(migration).toContain("and owner_id = actor_id::text");

    for (const bucket of ["profile-media", "community-media", "chat-media", "report-evidence"]) {
      expect(migration).toContain(`'${bucket}',\n    '${bucket}',\n    false`);
    }
    expect(migration).toContain("owner_id = (select auth.uid())::text");
    expect(migration).toContain("storage.foldername(name)");
    expect(migration).toContain("storage.extension(name)");
    expect(migration).not.toMatch(/\b(?:insert into|update|delete from)\s+storage\.objects\b/i);
  });

  it("keeps report evidence hidden from the accused and moderation server-authoritative", () => {
    const evidencePolicy = section(
      'create policy "Moderators can view report evidence"',
      'create policy "Reporters can attach evidence to open reports"',
    );
    expect(evidencePolicy).toContain("private.is_moderator");
    expect(evidencePolicy).not.toContain("reporter_id");

    const moderatorHelper = section(
      "create or replace function private.is_moderator",
      "create or replace function private.is_socially_active",
    );
    expect(moderatorHelper).toContain("'super_admin', 'admin', 'moderator'");
    expect(moderatorHelper).not.toContain("support");
    expect(migration).toContain("public.create_report(\n  p_target_type public.report_target_type");
    expect(migration).toContain("public.claim_moderation_case(p_case_id uuid)");
    expect(migration).toContain("public.get_moderation_report_context(p_report_id uuid)");
    expect(migration).toContain("public.get_moderation_report_attachment(");
    expect(migration).toContain("'moderation.report_context_viewed'");
    expect(migration).toContain("'moderation.report_attachment_viewed'");
    expect(migration).toContain("report.target_type = 'message'");
    expect(migration).toContain("report.target_type = 'community_post'");
    expect(migration).toContain("public.apply_moderation_action(\n  p_report_id uuid");
    expect(migration).toContain("returns public.sanctions");
  });

  it("models consent-first messaging and publishes realtime launch tables", () => {
    expect(migration).toContain("create table public.conversation_requests");
    expect(migration).toContain("public.request_conversation(\n  p_target_profile_id uuid");
    expect(migration).toContain("public.respond_to_conversation_request(p_request_id uuid, p_accept boolean)");
    expect(migration).toContain("public.send_message(\n  p_conversation_id uuid");
    expect(migration).toContain("p_client_message_id uuid default null");
    expect(migration).toContain("messages_client_idempotency");
    expect(migration).toContain("public.mark_message_delivered(p_message_id uuid)");
    expect(migration).toContain("public.forward_message(\n  p_source_message_id uuid");
    expect(migration).toContain("forwarded_from_attachment_id");
    expect(migration).toContain("public.invite_group_members(p_conversation_id uuid, p_member_ids uuid[])");
    expect(migration).toContain("public.remove_group_member(p_conversation_id uuid, p_profile_id uuid)");
    expect(migration).toContain("public.set_group_member_role(");
    expect(migration).toContain("create table public.message_reactions");
    expect(migration).toContain("create table public.message_receipts");
    expect(migration).toMatch(
      /'message_received',\s*'conversation',\s*p_conversation_id,\s*'\{\}'::jsonb,\s*'message:' \|\| message_record\.id::text/,
    );
    expect(migration).toContain("alter publication supabase_realtime add table public.%I");
    for (const table of ["conversation_requests", "messages", "message_receipts", "notifications"]) {
      expect(migration).toContain(`'${table}'`);
    }
    expect(migration).toContain('on realtime.messages for select to authenticated');
    expect(migration).toContain('on realtime.messages for insert to authenticated');
    expect(migration).toContain("realtime.messages.extension in ('broadcast', 'presence')");
    expect(migration).not.toContain("alter table realtime.messages enable row level security");
    expect(migration).not.toContain("create table realtime.messages");
    expect(migration).toContain("vendor-managed realtime.messages is missing");
    expect(migration).toContain("conversation:<uuid>");
    expect(migration).toContain("'audio/wav'");
    expect(migration).toContain("'ogg', 'wav', 'pdf'");
  });

  it("queues export, deactivation, and delayed deletion without pretending to delete Auth users", () => {
    expect(migration).toContain("create type public.account_lifecycle_kind as enum ('data_export', 'deactivate', 'delete')");
    expect(migration).toContain("public.request_account_lifecycle(\n  p_kind public.account_lifecycle_kind");
    expect(migration).toContain("p_confirmation is distinct from 'CONFIRMAR'");
    expect(migration).toContain("interval '30 days'");
    expect(migration).toContain("public.cancel_account_lifecycle(p_request_id uuid)");
    expect(migration).toContain("private.account_access_enabled");
    expect(migration).not.toMatch(/delete from auth\.users/i);
  });

  it("derives expired moderation status on the server and converges stale media cleanup", () => {
    expect(migration).toContain("private.effective_profile_account_status(p_actor uuid default auth.uid())");
    expect(migration).toContain("public.get_own_account_status()");
    expect(migration).toContain("public.reconcile_expired_profile_restrictions(p_limit integer default 100)");
    expect(migration).toContain("'moderation.restriction_expired'");
    expect(migration).toContain(
      "status in ('pending', 'failed') and updated_at < timezone('utc', now()) - interval '1 hour'",
    );
    expect(migration).toContain(
      "status = 'pending' and updated_at < timezone('utc', now()) - interval '1 hour'",
    );
    expect(migration).toContain("removed_at timestamptz");
    expect(migration).toContain("cleanup_requested_at timestamptz");
    expect(migration).toContain("private.mark_message_attachment_tree_removed(p_message_id uuid)");
    expect(migration).toContain("with recursive removed_attachments(id) as");
    expect(migration).toContain("public.list_message_attachment_cleanup(p_limit integer default 100)");
    expect(migration).toContain("public.complete_message_attachment_cleanup(p_attachment_id uuid)");
    expect(migration).toContain("Forwarded attachment references must be cleaned first.");
    expect(migration).toContain("private.chat_object_is_sanctioned");
    expect(migration).toContain("and attachment.removed_at is null");
    expect(rlsIntegration).toContain("removed message projection must not return attachment ids");
    expect(rlsIntegration).toContain("sanctioned message media must be denied immediately");
  });

  it("aligns validation with final table names, validated constraints, and all Realtime tables", () => {
    for (const table of ["blocks", "community_posts", "post_media", "post_comments", "post_reactions"]) {
      expect(validation).toContain(`('${table}')`);
    }
    for (const legacyTable of ["user_blocks", "posts", "post_attachments", "comments", "reactions"]) {
      expect(validation).not.toContain(`('${legacyTable}')`);
    }

    expect(migration).toContain("validate constraint profiles_avatar_path_payload_limit");
    expect(migration).toContain("validate constraint profile_details_favorite_season_payload_limit");
    expect(migration).toContain("validate constraint profile_details_games_payload_limit");
    expect(hardeningAudit).toContain("begin transaction read only");
    expect(hardeningAudit).toContain("violation_count = 0 as passed");
    expect(validation).toContain("storage_policies_complete");
    expect(validation).toContain("realtime_authorization_policies_complete");
    expect(validation).toContain("critical_functions_present");

    for (const table of [
      "friendships",
      "blocks",
      "community_memberships",
      "community_posts",
      "post_comments",
      "post_reactions",
      "conversation_members",
      "conversation_requests",
      "messages",
      "message_reactions",
      "message_attachments",
      "message_receipts",
      "notifications",
    ]) {
      expect(validation).toContain(`('${table}')`);
      expect(migration).toContain(`'${table}'`);
    }
  });

  it("ships a destructive-safe RLS integration gate for all launch trust levels", () => {
    expect(rlsIntegration).toMatch(/^-- ORHA transactional RLS integration gate\./);
    expect(rlsIntegration).toMatch(/^begin;/m);
    expect(rlsIntegration).toMatch(/^rollback;/m);
    expect(rlsIntegration).not.toMatch(/^commit;/m);
    expect(rlsIntegration).toContain("set local role authenticated");
    expect(rlsIntegration).toContain("set local role service_role");
    expect(rlsIntegration).toContain("request.jwt.claims");
    expect(rlsIntegration).toContain("community moderator must not inherit global moderation");
    expect(rlsIntegration).toContain("moderator role must pass global moderation guard");
    expect(rlsIntegration).toContain("admin role must pass moderation guard");
    expect(rlsIntegration).toContain("super_admin role must pass moderation guard");
    expect(rlsIntegration).toContain("support role must not pass moderation guard");
    expect(rlsIntegration).toContain("Storage upload/orphan/read/evidence policies must be installed");
    expect(rlsIntegration).toContain("Realtime Broadcast/Presence policies must be private");
    expect(rlsIntegration).toContain("all 14 client Realtime tables must be published");
  });

  it("is structurally complete enough for the staged SQL gate", () => {
    expect((migration.match(/\$\$/g) ?? []).length % 2).toBe(0);
    expect(migration).toContain("Forward-only");
    expect(migration).toContain("Transaction-safe");
    expect(migration).not.toMatch(/^\s*(?:begin|commit|rollback)\s*;/im);
    expect(migration).toContain("ORHA social launch schema already exists; do not replay");
    expect(migration).toContain("Fail the transaction if the security-critical launch postconditions are incomplete");
    expect(migration).toContain("has_table_privilege('anon'");
    expect(migration).toContain("20260816130000_security_privacy_hardening.sql");
    expect(migration).toContain("create or replace function public.handle_new_user()");
    expect(migration).toContain("insert into public.notification_preferences (profile_id)");
    expect(migration).toContain("insert into public.user_settings (profile_id)");
    expect(migration).not.toMatch(/into\s+source_attachment\s*,\s*source_conversation_id/i);
    expect(migration).toContain("select * into source_attachment");
    expect(migration).toContain("select conversation_id into source_conversation_id");
    expect(migration).not.toMatch(/is\s+distinct\s+from\s+case\b/i);
    expect(migration).toMatch(/message_record\.body\s+is\s+distinct\s+from\s*\(\s*case/i);
    expect(migration).not.toMatch(/set\s+status\s*=\s*case\b/i);
    for (const enumType of [
      "public.friendship_status",
      "public.community_membership_status",
      "public.conversation_request_status",
      "public.conversation_member_status",
      "public.content_status",
      "public.report_status",
    ]) {
      expect(migration).toContain(`end)::${enumType}`);
    }
  });
});
