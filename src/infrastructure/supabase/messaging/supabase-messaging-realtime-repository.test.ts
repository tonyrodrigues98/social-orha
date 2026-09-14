import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Message, MessagingRepository } from "@/domains/messaging";
import { SupabaseMessagingRealtimeRepository } from "./supabase-messaging-realtime-repository";

const persistedMessage: Message = {
  id: "message-1",
  clientMessageId: "client-1",
  conversationId: "conversation-1",
  senderId: "user-2",
  senderName: "Ana",
  senderAvatarUrl: null,
  kind: "text",
  body: "Olá",
  media: [],
  replyTo: null,
  forwardedFromMessageId: null,
  reactions: [],
  receipts: [],
  deliveryState: "sent",
  createdAt: "2026-08-16T12:00:00.000Z",
  editedAt: null,
  deletedAt: null,
};

describe("SupabaseMessagingRealtimeRepository", () => {
  it("deduplicates repeated events and removes the channel exactly once", async () => {
    const handlers: Array<{
      config: { event: string; table: string };
      callback: (payload: unknown) => void;
    }> = [];
    const channel: Record<string, unknown> = {};
    channel.on = vi.fn((type, config, callback) => {
      if (type === "postgres_changes") {
        handlers.push({ config: config as { event: string; table: string }, callback: callback as (payload: unknown) => void });
      }
      return channel;
    });
    channel.subscribe = vi.fn(() => channel);
    channel.presenceState = vi.fn(() => ({}));
    channel.send = vi.fn().mockResolvedValue("ok");
    channel.track = vi.fn().mockResolvedValue("ok");
    channel.untrack = vi.fn().mockResolvedValue("ok");
    const removeChannel = vi.fn().mockResolvedValue("ok");
    const createChannel = vi.fn(() => channel);
    const client = { channel: createChannel, removeChannel } as unknown as SupabaseClient;
    const getMessage = vi.fn().mockResolvedValue(persistedMessage);
    const repository = { getMessage } as unknown as MessagingRepository;
    const realtime = new SupabaseMessagingRealtimeRepository(client, repository);
    const onEvent = vi.fn();

    const session = realtime.subscribe({
      conversationId: "conversation-1",
      userId: "user-1",
      onEvent,
    });
    const insert = handlers.find((handler) => handler.config.table === "messages" && handler.config.event === "INSERT");
    const payload = { new: { id: "message-1", conversation_id: "conversation-1", created_at: persistedMessage.createdAt }, old: {} };
    insert?.callback(payload);
    insert?.callback(payload);
    await Promise.resolve();
    await Promise.resolve();

    expect(getMessage).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(createChannel).toHaveBeenCalledWith("conversation:conversation-1", expect.objectContaining({
      config: expect.objectContaining({
        private: true,
        broadcast: expect.objectContaining({ replication_ready: true }),
      }),
    }));

    const preferences = handlers.find((handler) => handler.config.table === "conversation_preferences");
    preferences?.callback({
      new: {
        conversation_id: "conversation-1",
        profile_id: "user-1",
        cleared_before: "2026-08-16T12:05:00.000Z",
        updated_at: "2026-08-16T12:05:00.000Z",
      },
      old: {},
    });
    expect(onEvent).toHaveBeenLastCalledWith({
      entity: "preferences",
      operation: "change",
      conversationId: "conversation-1",
      clearedBefore: "2026-08-16T12:05:00.000Z",
    });
    session.unsubscribe();
    session.unsubscribe();
    expect(removeChannel).toHaveBeenCalledTimes(1);
  });

  it("publishes typing only after the private channel subscribes and cleans presence once", async () => {
    let statusCallback: ((status: string) => void) | undefined;
    let systemCallback: ((payload: { extension: string; status: string }) => void) | undefined;
    const channel: Record<string, unknown> = {};
    channel.on = vi.fn((type: string, _config: unknown, callback: typeof systemCallback) => {
      if (type === "system") systemCallback = callback;
      return channel;
    });
    channel.subscribe = vi.fn((callback: (status: string) => void) => { statusCallback = callback; return channel; });
    channel.presenceState = vi.fn(() => ({}));
    channel.send = vi.fn().mockResolvedValue("ok");
    channel.track = vi.fn().mockResolvedValue("ok");
    channel.untrack = vi.fn().mockResolvedValue("ok");
    const removeChannel = vi.fn().mockResolvedValue("ok");
    const client = { channel: vi.fn(() => channel), removeChannel } as unknown as SupabaseClient;
    const repository = { getMessage: vi.fn() } as unknown as MessagingRepository;
    const realtime = new SupabaseMessagingRealtimeRepository(client, repository);

    const onEvent = vi.fn();
    const session = realtime.subscribe({ conversationId: "conversation-1", userId: "user-1", onEvent });
    await session.setTyping(true);
    expect(channel.send).not.toHaveBeenCalled();

    statusCallback?.("SUBSCRIBED");
    await session.setTyping(true);
    expect(channel.track).not.toHaveBeenCalled();
    expect(channel.send).not.toHaveBeenCalled();

    systemCallback?.({ extension: "system", status: "ok" });
    await session.setTyping(true);
    expect(channel.track).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1" }));
    expect(channel.send).toHaveBeenCalledWith(expect.objectContaining({ event: "typing", payload: expect.objectContaining({ isTyping: true }) }));
    expect(onEvent).toHaveBeenCalledWith({
      entity: "sync",
      operation: "ready",
      conversationId: "conversation-1",
    });

    session.unsubscribe();
    session.unsubscribe();
    expect(channel.untrack).toHaveBeenCalledTimes(1);
    expect(removeChannel).toHaveBeenCalledTimes(1);
  });
});
