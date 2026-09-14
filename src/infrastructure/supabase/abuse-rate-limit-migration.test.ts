import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260816230000_abuse_rate_limits.sql"),
  "utf8",
);

const runtimeGate = readFileSync(
  resolve(process.cwd(), "scripts/supabase-rate-limit-integration.sql"),
  "utf8",
);

describe("server-authoritative abuse rate limits", () => {
  it("protects every launch mutation surface with two bounded windows", () => {
    expect(migration).toContain("create table private.actor_rate_limit_policies");
    expect(migration).toContain("create table private.actor_rate_limit_windows");
    expect(migration.match(/\('(?:friendship_request|conversation_request|report_create|community_post_create|post_comment_create|message_send)'/g))
      .toHaveLength(12);

    for (const trigger of [
      "enforce_friendship_request_rate_limit",
      "enforce_conversation_request_rate_limit",
      "enforce_community_post_create_rate_limit",
      "enforce_post_comment_create_rate_limit",
      "enforce_message_send_rate_limit",
      "enforce_report_create_rate_limit",
    ]) {
      expect(migration).toContain(`create trigger ${trigger}`);
    }
  });

  it("uses atomic upserts and a PostgREST-native 429 error", () => {
    expect(migration).toContain(
      "on conflict (actor_id, action, window_seconds, window_started_at)",
    );
    expect(migration).toContain(
      "request_count = private.actor_rate_limit_windows.request_count + 1",
    );
    expect(migration).toContain("raise sqlstate 'PT429'");
    expect(migration).toContain("'retry_after_seconds', retry_after_seconds");
    expect(migration).not.toMatch(/\bbegin;|\bcommit;/i);
  });

  it("stores no content or target payload and audits only the last allowed sensitive event", () => {
    const windowDefinition = migration.match(
      /create table private\.actor_rate_limit_windows \(([\s\S]*?)\n\);/,
    )?.[1];
    expect(windowDefinition).toBeDefined();
    expect(windowDefinition).not.toMatch(/body|details|payload|target_id|ip_address/i);
    expect(migration).toContain("'security.rate_limit_capacity'");
    expect(migration).toContain("and current_count = policy_record.max_requests");
  });

  it("does not expose policies, counters, or trigger helpers to browser roles", () => {
    expect(migration).toContain(
      "revoke all on table private.actor_rate_limit_policies from public, anon, authenticated",
    );
    expect(migration).toContain(
      "revoke all on table private.actor_rate_limit_windows from public, anon, authenticated",
    );
    expect(migration).toContain(
      "revoke all on function private.consume_actor_rate_limits(uuid, text) from public, anon, authenticated",
    );
    expect(migration).toContain(
      "grant execute on function public.cleanup_actor_rate_limit_windows(integer) to service_role",
    );
    expect(migration).toContain(
      "where setting in ('search_path=', 'search_path=\"\"')",
    );
  });

  it("keeps a transactional runtime gate for PT429, rollback, privacy, and audit metadata", () => {
    expect(runtimeGate).toContain("when sqlstate 'PT429'");
    expect(runtimeGate).toContain("rate-limit state must be private from anon");
    expect(runtimeGate).toContain("the denied increment must roll back at capacity");
    expect(runtimeGate).toContain("capacity audit metadata must not contain target or content payload");
    expect(runtimeGate.trimEnd().endsWith("rollback;")).toBe(true);
  });
});
