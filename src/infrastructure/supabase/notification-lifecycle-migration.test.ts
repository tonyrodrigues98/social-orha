import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260816240000_notification_lifecycle_hardening.sql",
  ),
  "utf8",
);

const runtimeGate = readFileSync(
  resolve(process.cwd(), "scripts/supabase-notification-integration.sql"),
  "utf8",
);

describe("notification lifecycle hardening", () => {
  it("adds typed server-derived community and post deep-link context", () => {
    expect(migration).toContain(
      "add column community_id uuid references public.communities(id) on delete set null",
    );
    expect(migration).toContain(
      "add column post_id uuid references public.community_posts(id) on delete set null",
    );
    expect(migration).toContain("when 'community_post' then");
    expect(migration).toContain("when 'post_comment' then");
    expect(migration).toContain("resolved_community_id");
    expect(migration).toContain("resolved_post_id");
  });

  it("makes the trusted system channel mandatory without claiming transport delivery", () => {
    expect(migration).toContain("if p_channel = 'system' then");
    expect(migration).toContain("enabled := true");
    expect(migration).toContain("E-mail and push remain");
    expect(migration).not.toMatch(/email_enabled\s*=\s*true|push_enabled\s*=\s*true/);
  });

  it("produces bounded membership and post lifecycle notifications", () => {
    expect(migration).toContain("create trigger community_memberships_notify_lifecycle");
    expect(migration).toContain("create trigger community_posts_notify_lifecycle");
    expect(migration).toContain("limit 20");
    expect(migration).toContain("limit 250");
    expect(migration).toContain("'community_join_request'");
    expect(migration).toContain("'community_membership_accepted'");
    expect(migration).toContain("'community_post_created'");
    expect(migration).toContain("'community_post_removed'");
  });

  it("keeps dedupe and block-aware community delivery in the database", () => {
    expect(migration).toContain("on conflict do nothing");
    expect(migration.match(/private\.is_blocked_between\(/g)?.length).toBeGreaterThanOrEqual(2);
    expect(migration).toContain("'community_post_created:' || new.id::text");
    expect(migration).toContain("preference.community_enabled");
  });

  it("does not expose trusted producers to browser roles", () => {
    expect(migration).toContain(
      "revoke all on function private.enqueue_notification(uuid, uuid, text, text, uuid, jsonb, text, text)",
    );
    expect(migration).toContain(
      "revoke all on function private.notify_community_membership_lifecycle()",
    );
    expect(migration).toContain(
      "revoke all on function private.notify_community_post_lifecycle()",
    );
  });

  it("keeps a rollback-only runtime gate for preferences, dedupe, critical notices, and context", () => {
    expect(runtimeGate).toContain("community preferences must suppress optional post notifications");
    expect(runtimeGate).toContain("critical moderation notification must ignore system_enabled=false");
    expect(runtimeGate).toContain("dedupe must keep exactly one critical notification");
    expect(runtimeGate).toContain("community_id and post_id must be server-derived");
    expect(runtimeGate.trimEnd().endsWith("rollback;")).toBe(true);
  });
});
