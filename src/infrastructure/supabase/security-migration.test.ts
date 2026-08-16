import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(
  testDirectory,
  "../../../supabase/migrations/20260816130000_security_privacy_hardening.sql",
);
const migration = fs.readFileSync(migrationPath, "utf8");

function section(start: string, end: string) {
  const startIndex = migration.indexOf(start);
  const endIndex = migration.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return migration.slice(startIndex, endIndex);
}

describe("security and privacy migration", () => {
  it("replaces broad raw profile reads with owner-only policies", () => {
    expect(migration).toContain(
      'drop policy if exists "Authenticated users can view completed profiles"',
    );
    expect(migration).toContain(
      'drop policy if exists "Authenticated users can view details for completed profiles"',
    );
    expect(migration).toMatch(
      /create policy "Users can view their own profile"[\s\S]*using \(id = \(select auth\.uid\(\)\)\)/,
    );
    expect(migration).toMatch(
      /create policy "Users can view their own profile details"[\s\S]*using \(profile_id = \(select auth\.uid\(\)\)\)/,
    );
  });

  it("models friendship separately from conversations and exposes writes only as RPCs", () => {
    expect(migration).toContain("create table if not exists public.friendships");
    expect(migration).toContain("constraint friendships_distinct_people");
    expect(migration).toContain("create unique index if not exists friendships_unique_pair");
    expect(migration).toContain("revoke all on public.friendships from anon, authenticated");
    expect(migration).toContain("grant select on public.friendships to authenticated");
    expect(migration).toContain("public.request_friendship(target_user_id uuid)");
    expect(migration).toContain("public.respond_to_friendship(");
    expect(migration).toContain("public.remove_friendship(friendship_id uuid)");
  });

  it("masks location, favorites, and gallery access without returning birth dates", () => {
    const rpc = section(
      "create or replace function public.get_visible_profiles(",
      "revoke all on function public.get_visible_profiles",
    );
    expect(rpc).toContain("privacy.profile_visibility = 'friends'");
    expect(rpc).toContain("privacy.location_visibility = 'friends'");
    expect(rpc).toContain("privacy.favorites_visibility = 'friends'");
    expect(rpc).toContain("privacy.gallery_visibility = 'friends'");
    expect(rpc).toContain("case when access.can_view_location");
    expect(rpc).toContain("case when access.can_view_favorites");
    expect(rpc).not.toContain("birth_date");
    expect(migration).toContain(
      "grant execute on function public.get_visible_profiles(uuid, integer, integer) to authenticated",
    );
  });

  it("protects audit columns and bounds profile payloads", () => {
    const profileGrant = section(
      "grant update (\n  full_name,",
      ") on public.profiles to authenticated;",
    );
    const detailsGrant = section(
      "grant update (\n  personality,",
      ") on public.profile_details to authenticated;",
    );
    const privacyGrant = section(
      "grant update (\n  profile_visibility,",
      ") on public.profile_privacy to authenticated;",
    );

    for (const grant of [profileGrant, detailsGrant, privacyGrant]) {
      expect(grant).not.toContain("created_at");
      expect(grant).not.toContain("updated_at");
    }

    expect(migration).toContain("public.text_array_payload_is_valid");
    expect(migration).toContain("public.favorite_payload_is_valid");
    expect(migration).toContain("profiles_avatar_path_payload_limit");
    expect(migration).toContain("profile_details_movies_payload_limit");
    expect(migration).toContain("not valid");
  });
});
