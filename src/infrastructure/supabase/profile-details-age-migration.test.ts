import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.resolve(
  process.cwd(),
  "supabase/migrations/20260816210000_profile_details_age_privacy.sql",
);
const launchMigrationPath = path.resolve(
  process.cwd(),
  "supabase/migrations/20260816170000_social_launch_schema.sql",
);
const integrationPath = path.resolve(
  process.cwd(),
  "scripts/supabase-rls-integration.sql",
);
const migration = fs.readFileSync(migrationPath, "utf8");
const launchMigration = fs.readFileSync(launchMigrationPath, "utf8");
const integration = fs.readFileSync(integrationPath, "utf8");

describe("profile details and age privacy migration", () => {
  it("adds private-by-default age visibility using the shared visibility enum", () => {
    expect(migration).toContain(
      "age_visibility public.profile_visibility not null default 'private'",
    );
    expect(migration).toContain("grant update (age_visibility) on public.profile_privacy to authenticated");
  });

  it("uses an allowlisted own-only details RPC and removes direct grants", () => {
    expect(migration).toContain("create or replace function public.update_own_profile_details(p_patch jsonb)");
    expect(migration).toContain("octet_length(p_patch::text) > 16384");
    expect(migration).toContain("Profile details patch contains unsupported fields.");
    expect(migration).toContain("where profile_id = actor_id");
    expect(migration).toContain("revoke update (");
    expect(migration).toContain("hobbies\n) on public.profile_details from authenticated");
    expect(migration).not.toMatch(/update_own_profile_details[\s\S]*?'favorite_movies'/);
  });

  it("freezes every profile mutation surface while moderation is not active", () => {
    expect(migration.match(/private\.effective_profile_account_status\(\(select auth\.uid\(\)\)\) = 'active'/g)?.length)
      .toBeGreaterThanOrEqual(6);
    expect(migration).toContain("private.effective_profile_account_status(actor_id) <> 'active'");
    expect(migration).toContain('on public.profiles for update to authenticated');
    expect(migration).toContain('on public.profile_details for update to authenticated');
    expect(migration).toContain('on public.profile_privacy for update to authenticated');
  });

  it("returns only a derived age and never birth_date in the public result shape", () => {
    const returnShape = migration.match(
      /create or replace function public\.get_visible_profile_age\(p_profile_id uuid\)\s+returns table \(([\s\S]*?)\)\s+language sql/,
    )?.[1];
    expect(returnShape).toContain("age_years smallint");
    expect(returnShape).toContain("can_view_age boolean");
    expect(returnShape).not.toContain("birth_date");
    expect(migration).toContain("extract(year from age(current_date, profile.birth_date))::smallint");
  });

  it("requires active completed viewers and targets for third-party disclosure", () => {
    expect(migration).toContain("private.effective_profile_account_status(viewer.viewer_id) = 'active'");
    expect(migration).toContain("private.is_socially_active(viewer.viewer_id)");
    expect(migration).toContain("private.is_socially_active(profile.id)");
    expect(migration).toContain("private.can_view_profile(profile.id, viewer.viewer_id)");
    expect(migration).toContain("privacy.age_visibility = 'public'");
    expect(migration).toContain("privacy.age_visibility = 'friends' and friendship.is_friend");
  });

  it("inherits bidirectional block protection from the canonical profile predicate", () => {
    expect(launchMigration).toMatch(
      /create or replace function private\.can_view_profile[\s\S]*?not private\.is_blocked_between\(p_target_profile_id, p_viewer_id\)/,
    );
    expect(launchMigration).toMatch(
      /create or replace function private\.is_blocked_between[\s\S]*?blocker_id = p_first and blocked_id = p_second[\s\S]*?blocker_id = p_second and blocked_id = p_first/,
    );
  });

  it("does not grant either profile RPC to anonymous callers", () => {
    expect(migration).toContain(
      "revoke all on function public.update_own_profile_details(jsonb) from public, anon",
    );
    expect(migration).toContain(
      "revoke all on function public.get_visible_profile_age(uuid) from public, anon",
    );
    expect(migration).not.toContain("grant execute on function public.get_visible_profile_age(uuid) to anon");
  });

  it("keeps transactional runtime cases for owner, moderation, privacy and blocks", () => {
    expect(integration).toContain("through 20260816210000");
    expect(integration).toContain("owner details RPC must normalize");
    expect(integration).toContain("restricted accounts must not update enrichment");
    expect(integration).toContain("friends-only age must be visible to an accepted friend");
    expect(integration).toContain("friends-only age must remain hidden from a stranger");
    expect(integration).toContain("a block in either direction must make the age projection unavailable");
    expect(integration).toContain("age visibility must never override private profile visibility");
    expect(integration).toContain("an onboarding-incomplete viewer must not query third-party ages");
    expect(integration).toContain("public age RPC result shape must never contain birth_date");
    expect(integration.trimEnd().endsWith("rollback;")).toBe(true);
  });
});
