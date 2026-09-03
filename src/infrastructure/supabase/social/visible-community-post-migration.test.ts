import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  path.resolve("supabase/migrations/20260816250000_visible_community_post.sql"),
  "utf8",
).toLocaleLowerCase("en-US");

describe("visible community publication migration", () => {
  it("exposes one hardened authenticated by-id RPC", () => {
    expect(migration).toContain(
      "create or replace function public.get_visible_community_post",
    );
    expect(migration).toContain("p_post_id uuid");
    expect(migration).toContain("security definer");
    expect(migration).toContain("stable");
    expect(migration).toContain("set search_path = ''");
    expect(migration).not.toMatch(/^begin;|^commit;/m);
    expect(migration).toContain(
      "revoke all on function public.get_visible_community_post(uuid) from public, anon, authenticated",
    );
    expect(migration).toContain(
      "grant execute on function public.get_visible_community_post(uuid) to authenticated",
    );
    expect(migration).toContain(
      "has_function_privilege('public', visible_post_function, 'execute')",
    );
    expect(migration).toContain(
      "has_function_privilege('anon', visible_post_function, 'execute')",
    );
  });

  it("reuses server authority and collapses unavailable records to zero rows", () => {
    for (const predicate of [
      "private.account_access_enabled(viewer_id)",
      "private.is_socially_active(viewer_id)",
      "private.is_blocked_between",
      "private.can_view_profile",
      "private.can_view_community_post(post.id, viewer_id)",
    ]) {
      expect(migration).toContain(predicate);
    }
    expect(migration).toContain("post.id = p_post_id");
    expect(migration).toContain("post.community_id is not null");
    expect(migration).toContain("post.status = 'active'");
    expect(migration).not.toMatch(/raise exception '.*(?:post|publication).*(?:missing|removed|private)/);
  });

  it("returns only bounded publication and masked author fields", () => {
    expect(migration).toContain("limit 1;");
    expect(migration).toContain("case when author_access.visible then post.author_id else null end");
    expect(migration).toContain("case when author_access.visible then author.full_name else null end");
    expect(migration).not.toContain("select post.*");
  });
});
