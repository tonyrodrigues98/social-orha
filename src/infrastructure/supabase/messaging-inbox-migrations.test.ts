import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const inboxMigration = readFileSync(
  resolve("supabase/migrations/20260914108000_messaging_inbox_realtime.sql"),
  "utf8",
);
const summariesMigration = readFileSync(
  resolve("supabase/migrations/20260914109000_messaging_profile_summaries.sql"),
  "utf8",
);

describe("messaging inbox migrations", () => {
  it("authorizes only the authenticated user's private inbox topic", () => {
    expect(inboxMigration).toContain(
      "'messaging-inbox:' || (select auth.uid())::text",
    );
    expect(inboxMigration).toContain(
      "on realtime.messages for select to authenticated",
    );
    expect(inboxMigration).not.toMatch(/on realtime\.messages for insert/i);
    expect(inboxMigration).toContain(
      "alter publication supabase_realtime add table public.conversations",
    );
  });

  it("exposes participant identity only through an authenticated bounded RPC", () => {
    expect(summariesMigration).toContain(
      "create or replace function public.get_messaging_profile_summaries(p_profile_ids uuid[])",
    );
    expect(summariesMigration).toContain("cardinality(requested_ids) > 100");
    expect(summariesMigration).toContain(
      "from public.conversation_requests as request",
    );
    expect(summariesMigration).toContain(
      "join public.conversation_members as target_membership",
    );
    expect(summariesMigration).toContain(
      "not private.is_blocked_between(actor_id, profile.id)",
    );
    expect(summariesMigration).toContain(
      "revoke all on function public.get_messaging_profile_summaries(uuid[]) from public, anon",
    );
    expect(summariesMigration).toContain(
      "grant execute on function public.get_messaging_profile_summaries(uuid[]) to authenticated",
    );
  });
});
