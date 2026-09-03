import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.resolve(
  "supabase/migrations/20260816220000_home_dashboard_summary.sql",
);
const migration = fs.readFileSync(migrationPath, "utf8").toLocaleLowerCase("en-US");

describe("Home dashboard summary migration", () => {
  it("exposes one bounded authenticated RPC with hardened execution context", () => {
    expect(migration).toContain("create or replace function public.get_home_dashboard_summary");
    expect(migration).toContain("p_recent_limit integer default 5");
    expect(migration).toContain("security definer");
    expect(migration).toContain("stable");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("item_limit integer := least(greatest(coalesce(p_recent_limit, 5), 1), 10)");
    expect(migration).toContain("pg_column_size(summary) > 131072");
    expect(migration).not.toMatch(/^begin;|^commit;/m);
    expect(migration).toContain("to_regprocedure('private.can_view_message(uuid,uuid)')");
    expect(migration).toContain("where setting in ('search_path=', 'search_path=\"\"')");
    expect(migration).toContain(
      "has_function_privilege('anon', dashboard_function, 'execute')",
    );
    expect(migration).toContain(
      "has_function_privilege('authenticated', dashboard_function, 'execute')",
    );
    expect(migration).toContain(
      "revoke all on function public.get_home_dashboard_summary(integer) from public, anon, authenticated",
    );
    expect(migration).toContain(
      "grant execute on function public.get_home_dashboard_summary(integer) to authenticated",
    );
  });

  it("reuses authoritative privacy, account and cleared-history predicates", () => {
    for (const predicate of [
      "private.account_access_enabled(viewer_id)",
      "private.effective_profile_account_status(viewer_id)",
      "private.is_socially_active(viewer_id)",
      "private.is_blocked_between",
      "private.can_view_profile",
      "private.can_view_community_post",
      "private.can_view_message",
    ]) {
      expect(migration).toContain(predicate);
    }
    expect(migration).toContain("membership.status = 'active'");
    expect(migration).toContain("preference.archived_at is null");
    expect(migration).toContain("receipt.read_at is null");
    for (const mandatoryNotificationType of [
      "security_alert",
      "account_warning",
      "moderation_action",
      "community_membership_banned",
      "community_membership_unbanned",
      "community_role_changed",
      "community_post_removed",
    ]) {
      expect(migration).toContain(`'${mandatoryNotificationType}'`);
    }
    expect(migration).toContain(
      "coalesce(last_message.created_at, candidate.joined_at, candidate.created_at)",
    );
  });

  it("never projects private content bodies or notification payloads", () => {
    expect(migration).not.toMatch(/request\.opening_message/);
    expect(migration).not.toMatch(/message\.body/);
    expect(migration).not.toMatch(/notification\.payload/);
    expect(migration).not.toContain("'birthdatevalue'");
    expect(migration).not.toContain("auth.users");
  });
});
