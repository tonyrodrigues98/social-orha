import { describe, expect, it, vi } from "vitest";
import { SupabaseAdministrationRepository, mapAdministrationError } from "./administration-repository";

function clientFor(result: unknown) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { client: { rpc } as never, rpc };
}

const row = {
  user_id: "11111111-1111-4111-8111-111111111111",
  full_name: "Ana Operações",
  username: "ana.operacoes",
  role: "support" as const,
  updated_at: "2026-09-14T12:00:00.000Z",
};

describe("SupabaseAdministrationRepository", () => {
  it("maps a privacy-safe role page and stable cursor", async () => {
    const second = { ...row, user_id: "22222222-2222-4222-8222-222222222222" };
    const { client, rpc } = clientFor({ data: [row, second], error: null });
    const repository = new SupabaseAdministrationRepository(client);
    const page = await repository.listGlobalRoleAssignments({ query: "ana", limit: 1 });
    expect(rpc).toHaveBeenCalledWith("list_global_role_assignments", expect.objectContaining({
      p_query: "ana",
      p_limit: 2,
    }));
    expect(page.items).toEqual([expect.objectContaining({ userId: row.user_id, role: "support" })]);
    expect(page.nextCursor).toBe(`${row.updated_at}|${row.user_id}`);
  });

  it("uses only the audited RPC for role mutations", async () => {
    const { client, rpc } = clientFor({ data: [{ ...row, role: "moderator" }], error: null });
    const repository = new SupabaseAdministrationRepository(client);
    const result = await repository.assignGlobalRole({
      targetUserId: row.user_id,
      role: "moderator",
      reason: "Responsabilidade aprovada pela operação",
    });
    expect(rpc).toHaveBeenCalledWith("assign_global_role", {
      p_target_user_id: row.user_id,
      p_role: "moderator",
      p_reason: "Responsabilidade aprovada pela operação",
    });
    expect(result.role).toBe("moderator");
  });

  it("maps permission errors without exposing PostgreSQL details", () => {
    expect(mapAdministrationError({ code: "42501", message: "sensitive" })).toMatchObject({
      code: "permission",
      message: "Sua função não permite esta alteração.",
    });
  });
});
