import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "../database.types";
import { SupabaseSupportRepository } from "./support-repository";

const ticketId = "30000000-0000-4000-8000-000000000001";
const requesterId = "30000000-0000-4000-8000-000000000002";

function ticketRow(id: string, lastMessageAt: string) {
  return {
    id,
    requester_id: requesterId,
    requester_full_name: "Ana Clara",
    requester_avatar_path: null,
    subject: "Problema ao editar perfil",
    category: "technical" as const,
    status: "open" as const,
    priority: "normal" as const,
    assigned_to: null,
    assignee_full_name: null,
    last_message_at: lastMessageAt,
    resolved_at: null,
    created_at: lastMessageAt,
    updated_at: lastMessageAt,
  };
}

describe("Supabase support repository", () => {
  it("maps the private ticket read model and emits a stable cursor", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        ticketRow(ticketId, "2026-09-14T12:00:00.000Z"),
        ticketRow("30000000-0000-4000-8000-000000000003", "2026-09-14T11:00:00.000Z"),
        ticketRow("30000000-0000-4000-8000-000000000004", "2026-09-14T10:00:00.000Z"),
      ],
      error: null,
    });
    const repository = new SupabaseSupportRepository({ rpc } as unknown as SupabaseClient<Database>);

    await expect(repository.listTickets({ status: "open", limit: 2 })).resolves.toEqual({
      items: [
        expect.objectContaining({ id: ticketId, requesterName: "Ana Clara", priority: "normal" }),
        expect.objectContaining({ id: "30000000-0000-4000-8000-000000000003" }),
      ],
      nextCursor: "2026-09-14T11:00:00.000Z|30000000-0000-4000-8000-000000000003",
    });
    expect(rpc).toHaveBeenCalledWith("list_support_tickets", {
      p_status: "open",
      p_limit: 2,
      p_before_activity: undefined,
      p_before_id: undefined,
    });
  });

  it("maps paginated ticket messages without exposing database details", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          id: "31000000-0000-4000-8000-000000000001",
          ticket_id: ticketId,
          sender_id: requesterId,
          sender_name: "Ana Clara",
          sender_avatar_path: null,
          body: "Minha primeira mensagem.",
          created_at: "2026-09-14T12:00:00.000Z",
        },
      ],
      error: null,
    });
    const repository = new SupabaseSupportRepository({ rpc } as unknown as SupabaseClient<Database>);

    await expect(repository.listMessages(ticketId)).resolves.toEqual({
      items: [{
        id: "31000000-0000-4000-8000-000000000001",
        ticketId,
        senderId: requesterId,
        senderName: "Ana Clara",
        senderAvatarPath: null,
        body: "Minha primeira mensagem.",
        createdAt: "2026-09-14T12:00:00.000Z",
      }],
      nextCursor: null,
    });
  });

  it("uses server-authoritative RPCs for create, claim, reply, and state changes", async () => {
    const mutationTicket = {
      id: ticketId,
      requester_id: requesterId,
      subject: "Problema ao editar perfil",
      category: "technical" as const,
      status: "open" as const,
      priority: "normal" as const,
      assigned_to: null,
      last_message_at: "2026-09-14T12:00:00.000Z",
      resolved_at: null,
      created_at: "2026-09-14T12:00:00.000Z",
      updated_at: "2026-09-14T12:00:00.000Z",
    };
    const mutationMessage = {
      id: "31000000-0000-4000-8000-000000000001",
      ticket_id: ticketId,
      sender_id: requesterId,
      body: "Resposta persistente",
      created_at: "2026-09-14T12:01:00.000Z",
    };
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: mutationTicket, error: null })
      .mockResolvedValueOnce({ data: mutationMessage, error: null })
      .mockResolvedValueOnce({ data: mutationTicket, error: null })
      .mockResolvedValueOnce({ data: { ...mutationTicket, status: "resolved", priority: "high" }, error: null });
    const repository = new SupabaseSupportRepository({ rpc } as unknown as SupabaseClient<Database>);

    await repository.createTicket({
      subject: "Problema ao editar perfil",
      category: "technical",
      message: "Não consigo salvar minha biografia.",
    });
    await repository.reply(ticketId, "Resposta persistente");
    await repository.claim(ticketId);
    await repository.updateTicket({ ticketId, status: "resolved", priority: "high" });

    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "create_support_ticket",
      "reply_support_ticket",
      "claim_support_ticket",
      "update_support_ticket_state",
    ]);
  });

  it("rejects invalid cursors locally and maps server authorization failures", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "42501" } });
    const repository = new SupabaseSupportRepository({ rpc } as unknown as SupabaseClient<Database>);

    await expect(repository.listTickets({ cursor: "invalid" })).rejects.toMatchObject({
      kind: "validation",
    });
    expect(rpc).not.toHaveBeenCalled();
    await expect(repository.createTicket({
      subject: "Assunto suficiente",
      category: "other",
      message: "Mensagem longa o bastante.",
    })).rejects.toMatchObject({
      kind: "permission",
      message: "Você não tem permissão para acessar este chamado.",
    });
  });

  it("opens a private Realtime channel on the PrivateOnly project", async () => {
    const removeChannel = vi.fn().mockResolvedValue("ok");
    let systemListener: ((payload: { extension: string; status: string }) => void) | undefined;
    const channelApi = {
      on: vi.fn((type: string, _config: unknown, listener: typeof systemListener) => {
        if (type === "system") systemListener = listener;
        return channelApi;
      }),
      subscribe: vi.fn((listener: (status: string) => void) => {
        listener("SUBSCRIBED");
        systemListener?.({ extension: "system", status: "ok" });
        return channelApi;
      }),
    };
    const channel = vi.fn().mockReturnValue(channelApi);
    const repository = new SupabaseSupportRepository({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: requesterId } },
          error: null,
        }),
      },
      channel,
      removeChannel,
    } as unknown as SupabaseClient<Database>);

    const unsubscribe = await repository.subscribe(vi.fn());
    expect(channel).toHaveBeenCalledWith(`support:${requesterId}`, {
      config: {
        private: true,
        broadcast: { ack: false, self: false, replication_ready: true },
      },
    });
    unsubscribe();
    expect(removeChannel).toHaveBeenCalledWith(channelApi);
  });
});
