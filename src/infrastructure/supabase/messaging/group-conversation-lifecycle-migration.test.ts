import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve("supabase/migrations/20260903010000_group_conversation_lifecycle.sql"), "utf8");

describe("group conversation lifecycle migration", () => {
  it("keeps lifecycle decisions server-authoritative and audited", () => {
    expect(migration).toContain("create function public.leave_group_conversation");
    expect(migration).toContain("membership.role = 'owner'");
    expect(migration).toContain("create function public.transfer_group_ownership");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("create function public.close_group_conversation");
    expect(migration).toContain("conversation.group_closed");
  });

  it("does not expose lifecycle RPCs to anon or PUBLIC", () => {
    for (const signature of [
      "public.leave_group_conversation(uuid)",
      "public.transfer_group_ownership(uuid, uuid)",
      "public.close_group_conversation(uuid)",
    ]) {
      expect(migration).toContain(`revoke all on function ${signature} from public, anon;`);
      expect(migration).toContain(`grant execute on function ${signature} to authenticated, service_role;`);
    }
  });
});
