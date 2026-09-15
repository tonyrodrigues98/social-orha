import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    "supabase/migrations/20260914112000_authoritative_message_reactions.sql",
  ),
  "utf8",
);

describe("authoritative message reaction migration", () => {
  it("derives the actor and validates the real message authorization boundary", () => {
    expect(migration).toContain("create or replace function public.set_message_reaction");
    expect(migration).toContain("actor_id uuid := auth.uid()");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("private.account_access_enabled(actor_id)");
    expect(migration).toContain("private.is_socially_active(actor_id)");
    expect(migration).toContain("private.can_view_message(message_record.id, actor_id)");
    expect(migration).toContain("private.is_blocked_between");
    expect(migration).toContain("message_record.deleted_at is not null");
  });

  it("is idempotent and removes forged browser writes", () => {
    expect(migration).toContain("on conflict (message_id, reactor_id)");
    expect(migration).toContain("do update set kind = excluded.kind");
    expect(migration).toContain("and reactor_id = actor_id");
    expect(migration).toContain(
      "revoke insert, update, delete on public.message_reactions from authenticated",
    );
    expect(migration).toContain(
      "grant execute on function public.set_message_reaction(uuid, public.reaction_kind, boolean)",
    );
  });

  it("self-validates function security and least-privilege grants", () => {
    expect(migration).toContain("pg_get_functiondef");
    expect(migration).toContain("has_function_privilege");
    expect(migration).toContain("has_table_privilege");
    expect(migration).toContain("message_reactions browser grants are not read-only");
  });
});
