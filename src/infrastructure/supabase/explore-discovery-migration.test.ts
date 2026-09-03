import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(
  testDirectory,
  "../../../supabase/migrations/20260816190000_explore_discovery.sql",
);
const migration = fs.readFileSync(migrationPath, "utf8");
const validation = fs.readFileSync(
  path.resolve(testDirectory, "../../../scripts/supabase-validate.sql"),
  "utf8",
);
const rlsIntegration = fs.readFileSync(
  path.resolve(testDirectory, "../../../scripts/supabase-rls-integration.sql"),
  "utf8",
);

function functionSection(name: string, nextMarker: string): string {
  const start = migration.indexOf(`create or replace function public.${name}(`);
  const end = migration.indexOf(nextMarker, start + 1);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end);
}

describe("ORHA Explore discovery migration", () => {
  it("keeps interest discovery viewer-scoped and hides rare interests", () => {
    const section = functionSection(
      "search_discoverable_interests",
      "create or replace function public.search_discoverable_posts(",
    );

    expect(section).toContain("security definer");
    expect(section).toContain("set search_path = ''");
    expect(section).toContain("private.is_socially_active(viewer_id)");
    expect(section).toContain("private.can_view_profile(profile.id, viewer_id)");
    expect(section).toContain("having count(distinct authorized.profile_id) >= 2");
    expect(section).not.toContain("birth_date");
    expect(section).not.toContain("email");
  });

  it("returns only block-aware public posts from active public surfaces", () => {
    const section = functionSection(
      "search_discoverable_posts",
      "revoke all on function public.search_discoverable_interests",
    );

    expect(section).toContain("post.status = 'active'");
    expect(section).toContain("post.visibility = 'public'");
    expect(section).toContain("private.is_socially_active(author.id)");
    expect(section).toContain("private.can_view_profile(author.id, viewer_id)");
    expect(section).toContain("private.can_view_community_post(post.id, viewer_id)");
    expect(section).toContain("community.visibility = 'public'");
    expect(section).toContain("community.archived_at is null");
    expect(section).toContain("community.slug::text");
    expect(section).toContain("media.status = 'ready'");
  });

  it("caps every query and grants execution only to authenticated clients", () => {
    expect(migration.match(/p_limit > 50/g)).toHaveLength(2);
    expect(migration.match(/p_offset > 10000/g)).toHaveLength(2);
    expect(migration.match(/char_length\(normalized_search\) > 80/g)).toHaveLength(2);
    expect(migration).toContain(
      "revoke all on function public.search_discoverable_interests(text, integer, integer) from public, anon",
    );
    expect(migration).toContain(
      "revoke all on function public.search_discoverable_posts(text, integer, integer) from public, anon",
    );
    expect(migration).toContain(
      "grant execute on function public.search_discoverable_interests(text, integer, integer) to authenticated",
    );
    expect(migration).toContain(
      "grant execute on function public.search_discoverable_posts(text, integer, integer) to authenticated",
    );
    expect(validation).toContain("('20260816190000')");
    expect(validation).toContain("('public.search_discoverable_interests(text,integer,integer)')");
    expect(validation).toContain("('public.search_discoverable_posts(text,integer,integer)')");
    expect(rlsIntegration).toContain(
      "Explore must not reveal a public post when its author profile is not visible to the viewer",
    );
    expect(rlsIntegration).toContain(
      "Explore interest discovery must count only viewer-visible active profiles",
    );
    expect(rlsIntegration).toContain(
      "friend must discover a public post through its typed privacy-aware projection",
    );
  });
});
