import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MessageMedia, MessagingMediaRepository } from "@/domains/messaging";
import { SupabaseMessagingRepository } from "./supabase-messaging-repository";

function mediaRepository(): MessagingMediaRepository {
  return {
    upload: vi.fn(),
    remove: vi.fn(),
    createSignedUrl: vi.fn(),
    hydrateMedia: vi.fn(async (items: Omit<MessageMedia, "signedUrl">[]) =>
      items.map((item) => ({ ...item, signedUrl: "https://signed.example/file" }))),
  };
}

function queryResult(data: unknown) {
  const query: Record<string, unknown> = {};
  for (const method of ["select", "eq", "gt", "in", "is", "ilike", "order", "limit", "or"]) query[method] = vi.fn(() => query);
  query.maybeSingle = vi.fn().mockResolvedValue({ data, error: null });
  query.single = vi.fn().mockResolvedValue({ data, error: null });
  query.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve);
  return query;
}

const persistedRow = {
  id: "message-1",
  client_message_id: "client-1",
  conversation_id: "conversation-1",
  sender_id: "user-2",
  kind: "text",
  body: "Olá",
  forwarded_from_message_id: null,
  created_at: "2026-08-16T12:00:00.000Z",
  edited_at: null,
  deleted_at: null,
  sender: { full_name: "Ana", username: "ana" },
  attachments: [],
  reactions: [{ reactor_id: "user-1", kind: "amen" }],
  receipts: [{ profile_id: "user-1", delivered_at: "2026-08-16T12:00:30.000Z", read_at: "2026-08-16T12:01:00.000Z" }],
  reply_to: null,
};

const profileSummary = {
  profile_id: "user-2",
  full_name: "Ana",
  username: "ana",
  avatar_path: null,
};

describe("SupabaseMessagingRepository", () => {
  it("maps the authoritative message schema and a stable cursor", async () => {
    const query = queryResult([persistedRow]);
    const client = {
      from: vi.fn(() => query),
      rpc: vi.fn().mockResolvedValue({ data: [profileSummary], error: null }),
    } as unknown as SupabaseClient;
    const repository = new SupabaseMessagingRepository(client, mediaRepository());

    const page = await repository.listMessages({ conversationId: "conversation-1", userId: "user-1", limit: 1 });

    expect(page.items[0]).toMatchObject({
      id: "message-1",
      clientMessageId: "client-1",
      senderName: "Ana",
      deliveryState: "read",
      reactions: [{ kind: "amen", emoji: "🙏", userIds: ["user-1"], count: 1 }],
    });
    expect(page.nextCursor).toEqual({ createdAt: "2026-08-16T12:00:00.000Z", id: "message-1" });
  });

  it("sends through the idempotent security-definer RPC", async () => {
    const rpc = vi.fn((name: string) => Promise.resolve(name === "get_messaging_profile_summaries"
      ? { data: [{ ...profileSummary, profile_id: "user-1", full_name: "Pessoa" }], error: null }
      : { data: { id: "message-1" }, error: null }));
    const query = queryResult({ ...persistedRow, sender_id: "user-1", sender: { full_name: "Pessoa" } });
    const client = { rpc, from: vi.fn(() => query) } as unknown as SupabaseClient;
    const repository = new SupabaseMessagingRepository(client, mediaRepository());

    await repository.sendMessage({
      conversationId: "conversation-1",
      senderId: "user-1",
      senderName: "Pessoa",
      clientMessageId: "client-1",
      kind: "text",
      body: "Mensagem única",
      media: [],
    });

    expect(rpc).toHaveBeenCalledWith("send_message", {
      p_conversation_id: "conversation-1",
      p_kind: "text",
      p_body: "Mensagem única",
      p_reply_to_message_id: null,
      p_client_message_id: "client-1",
    });
  });

  it("sets reactions through the actor-authoritative RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const repository = new SupabaseMessagingRepository(
      { rpc } as unknown as SupabaseClient,
      mediaRepository(),
    );

    await repository.setReaction({
      conversationId: "conversation-1",
      messageId: "message-1",
      userId: "forged-user-id-is-ignored",
      emoji: "👍",
      active: true,
    });

    expect(rpc).toHaveBeenCalledWith("set_message_reaction", {
      p_message_id: "message-1",
      p_kind: "like",
      p_active: true,
    });
  });

  it("sends media through the atomic verification worker without pre-creating a message", async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { message: { id: "message-1" } }, error: null });
    const rpc = vi.fn().mockResolvedValue({
      data: [{ ...profileSummary, profile_id: "user-1", full_name: "Pessoa" }],
      error: null,
    });
    const query = queryResult({ ...persistedRow, kind: "audio", sender_id: "user-1", sender: { full_name: "Pessoa" } });
    const client = { rpc, functions: { invoke }, from: vi.fn(() => query) } as unknown as SupabaseClient;
    const repository = new SupabaseMessagingRepository(client, mediaRepository());

    await repository.sendMessage({
      conversationId: "conversation-1",
      senderId: "user-1",
      senderName: "Pessoa",
      clientMessageId: "client-1",
      kind: "audio",
      body: null,
      media: [{
        kind: "audio",
        bucket: "chat-media",
        storagePath: "user-1/conversation-1/client-1/0-audio.webm",
        signedUrl: "https://signed.example/audio",
        fileName: "audio.webm",
        mimeType: "audio/webm",
        sizeBytes: 128,
        width: null,
        height: null,
        durationSeconds: 2,
        waveform: [0.2, 0.8],
      }],
    });

    expect(rpc).not.toHaveBeenCalledWith("send_message", expect.anything());
    expect(invoke).toHaveBeenCalledWith("media-verify", { body: expect.objectContaining({
      scope: "message",
      conversationId: "conversation-1",
      clientMessageId: "client-1",
      kind: "audio",
      objectPath: "user-1/conversation-1/client-1/0-audio.webm",
    }) });
  });

  it("rejects legacy generic-file sends before any network mutation", async () => {
    const rpc = vi.fn();
    const invoke = vi.fn();
    const repository = new SupabaseMessagingRepository(
      { rpc, functions: { invoke } } as unknown as SupabaseClient,
      mediaRepository(),
    );
    const unsupported = {
      conversationId: "conversation-1",
      senderId: "user-1",
      senderName: "Pessoa",
      clientMessageId: "client-file",
      kind: "file",
      body: null,
      media: [{
        kind: "file",
        bucket: "chat-media",
        storagePath: "user-1/conversation-1/client-file/document.pdf",
        signedUrl: null,
        fileName: "document.pdf",
        mimeType: "application/pdf",
        sizeBytes: 128,
        width: null,
        height: null,
        durationSeconds: null,
        waveform: null,
      }],
    } as unknown as Parameters<typeof repository.sendMessage>[0];

    await expect(repository.sendMessage(unsupported)).rejects.toThrow("Arquivos genéricos");
    expect(rpc).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("persists favorite and clear watermarks only through the per-user RPCs", async () => {
    const favoriteRow = {
      conversation_id: "conversation-1",
      profile_id: "user-1",
      favorited_at: "2026-08-16T13:00:00.000Z",
      cleared_before: null,
      notifications_enabled: true,
      read_receipts_enabled: true,
      updated_at: "2026-08-16T13:00:00.000Z",
    };
    const clearedRow = { ...favoriteRow, cleared_before: "2026-08-16T13:01:00.000Z" };
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: favoriteRow, error: null })
      .mockResolvedValueOnce({ data: clearedRow, error: null });
    const repository = new SupabaseMessagingRepository({ rpc } as unknown as SupabaseClient, mediaRepository());

    const favorite = await repository.setConversationFavorite({ conversationId: "conversation-1", userId: "user-1", favorited: true });
    const cleared = await repository.clearConversation({ conversationId: "conversation-1", userId: "user-1" });

    expect(rpc).toHaveBeenNthCalledWith(1, "set_conversation_favorite", { p_conversation_id: "conversation-1", p_favorited: true });
    expect(rpc).toHaveBeenNthCalledWith(2, "clear_conversation_for_me", { p_conversation_id: "conversation-1" });
    expect(favorite.favoritedAt).toBe("2026-08-16T13:00:00.000Z");
    expect(cleared.clearedBefore).toBe("2026-08-16T13:01:00.000Z");
  });

  it("adds the clear watermark to conversation message queries", async () => {
    const preferenceQuery = queryResult({
      conversation_id: "conversation-1",
      profile_id: "user-1",
      cleared_before: "2026-08-16T11:30:00.000Z",
      notifications_enabled: true,
      read_receipts_enabled: true,
    });
    const messagesQuery = queryResult([persistedRow]);
    const client = {
      from: vi.fn((table: string) => table === "conversation_preferences" ? preferenceQuery : messagesQuery),
      rpc: vi.fn().mockResolvedValue({ data: [profileSummary], error: null }),
    } as unknown as SupabaseClient;
    const repository = new SupabaseMessagingRepository(client, mediaRepository());

    await repository.listMessages({ conversationId: "conversation-1", userId: "user-1" });

    expect(messagesQuery.gt).toHaveBeenCalledWith("created_at", "2026-08-16T11:30:00.000Z");
  });

  it("uses the dedicated delivered/read and forward RPCs", async () => {
    const rpc = vi.fn((name: string) => Promise.resolve(
      name === "get_messaging_profile_summaries"
        ? { data: [profileSummary], error: null }
        : name === "forward_message"
          ? { data: { id: "message-1" }, error: null }
          : { data: {}, error: null },
    ));
    const query = queryResult(persistedRow);
    const client = { rpc, from: vi.fn(() => query) } as unknown as SupabaseClient;
    const repository = new SupabaseMessagingRepository(client, mediaRepository());

    await repository.upsertReceipt({ conversationId: "conversation-1", messageId: "message-1", userId: "user-1", kind: "delivered" });
    await repository.forwardMessage({ userId: "user-1", sourceMessageId: "message-0", targetConversationIds: ["conversation-1"], clientMessageIds: ["client-1"] });

    expect(rpc).toHaveBeenNthCalledWith(1, "mark_message_delivered", { p_message_id: "message-1" });
    expect(rpc).toHaveBeenNthCalledWith(2, "forward_message", {
      p_source_message_id: "message-0",
      p_target_conversation_id: "conversation-1",
      p_client_message_id: "client-1",
    });
  });

  it("routes group administration to the least-privilege RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: {}, error: null });
    const client = { rpc } as unknown as SupabaseClient;
    const repository = new SupabaseMessagingRepository(client, mediaRepository());

    await repository.updateGroupMember({ userId: "owner", conversationId: "group-1", memberId: "member-1", action: "promote" });

    expect(rpc).toHaveBeenCalledWith("set_group_member_role", {
      p_conversation_id: "group-1",
      p_profile_id: "member-1",
      p_role: "admin",
    });
  });

  it("routes group lifecycle operations through authoritative RPCs", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: {}, error: null });
    const client = { rpc } as unknown as SupabaseClient;
    const repository = new SupabaseMessagingRepository(client, mediaRepository());

    await repository.leaveGroupConversation({ userId: "member", conversationId: "group-1" });
    await repository.transferGroupOwnership({ userId: "owner", conversationId: "group-1", newOwnerId: "member" });
    await repository.closeGroupConversation({ userId: "owner", conversationId: "group-1" });

    expect(rpc).toHaveBeenNthCalledWith(1, "leave_group_conversation", { p_conversation_id: "group-1" });
    expect(rpc).toHaveBeenNthCalledWith(2, "transfer_group_ownership", {
      p_conversation_id: "group-1",
      p_new_owner_id: "member",
    });
    expect(rpc).toHaveBeenNthCalledWith(3, "close_group_conversation", { p_conversation_id: "group-1" });
  });
});
