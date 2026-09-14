import type { RealtimePostgresChangesPayload, SupabaseClient } from "@supabase/supabase-js";
import type {
  ConversationPresence,
  MessagingPresenceSnapshot,
  MessagingRealtimeEvent,
  MessagingRealtimeRepository,
  MessagingRealtimeSession,
  MessagingRepository,
  TypingState,
} from "@/domains/messaging";

type RealtimeRow = Record<string, unknown>;

function row(value: unknown): RealtimeRow {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RealtimeRow : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function isValidId(value: string) {
  return /^[a-zA-Z0-9_-]{1,128}$/.test(value);
}

export class SupabaseMessagingRealtimeRepository implements MessagingRealtimeRepository {
  constructor(
    private readonly client: SupabaseClient,
    private readonly repository: MessagingRepository,
  ) {}

  subscribe(input: {
    conversationId: string;
    userId: string;
    onEvent: (event: MessagingRealtimeEvent) => void;
    onPresence?: (snapshot: MessagingPresenceSnapshot) => void;
    onTyping?: (state: TypingState) => void;
    onError?: (error: Error) => void;
  }): MessagingRealtimeSession {
    if (!isValidId(input.conversationId) || !isValidId(input.userId)) {
      input.onError?.(new Error("Identificador inválido para o canal privado."));
      return { setTyping: async () => undefined, unsubscribe: () => undefined };
    }

    let active = true;
    let subscribed = false;
    let replicationReady = false;
    let presenceTracked = false;
    let removed = false;
    const seen = new Set<string>();
    const remember = (key: string) => {
      if (seen.has(key)) return false;
      seen.add(key);
      if (seen.size > 512) seen.delete(seen.values().next().value ?? "");
      return true;
    };
    const reportError = (error: unknown) => {
      if (!active) return;
      input.onError?.(error instanceof Error ? error : new Error("Falha na atualização em tempo real."));
    };
    const emitRelated = (entity: "reaction" | "receipt" | "attachment", changed: RealtimeRow) => {
      const messageId = text(changed.message_id);
      if (!messageId) return;
      const identity = text(changed.id)
        || [messageId, text(changed.reactor_id), text(changed.profile_id), text(changed.kind)].join(":");
      const version = text(changed.updated_at) || text(changed.created_at) || text(changed.read_at) || text(changed.delivered_at);
      if (!remember(`${entity}:${identity}:${version}`)) return;
      void this.repository.getMessage(messageId, input.userId).then((message) => {
        if (!active || !message || message.conversationId !== input.conversationId) return;
        input.onEvent({ entity, operation: "change", conversationId: input.conversationId, messageId });
      }).catch(reportError);
    };
    const handleMessage = (
      operation: "insert" | "update",
      payload: RealtimePostgresChangesPayload<RealtimeRow>,
    ) => {
      const next = row(payload.new);
      if (text(next.conversation_id) !== input.conversationId) return;
      const messageId = text(next.id);
      const key = `message:${operation}:${messageId}:${text(next.edited_at) || text(next.deleted_at) || text(next.created_at)}`;
      if (!messageId || !remember(key)) return;
      void this.repository.getMessage(messageId, input.userId).then((message) => {
        if (!active || !message) return;
        input.onEvent({ entity: "message", operation, conversationId: input.conversationId, message });
      }).catch(reportError);
    };
    const handleDelete = (payload: RealtimePostgresChangesPayload<RealtimeRow>) => {
      const previous = row(payload.old);
      if (text(previous.conversation_id) !== input.conversationId) return;
      const messageId = text(previous.id);
      if (!messageId || !remember(`message:delete:${messageId}`)) return;
      input.onEvent({ entity: "message", operation: "delete", conversationId: input.conversationId, messageId });
    };

    const topic = `conversation:${input.conversationId}`;
    const filter = `conversation_id=eq.${input.conversationId}`;
    const channel = this.client.channel(topic, {
      config: {
        private: true,
        broadcast: { ack: true, self: false, replication_ready: true },
        presence: { key: input.userId },
      },
    });

    const activateRealtimeSession = () => {
      if (!active || !subscribed || !replicationReady || presenceTracked) return;
      presenceTracked = true;
      input.onEvent({ entity: "sync", operation: "ready", conversationId: input.conversationId });
      void channel.track({ userId: input.userId, onlineAt: new Date().toISOString() }).catch(reportError);
    };

    const publishPresence = () => {
      if (!active) return;
      const participants: ConversationPresence[] = Object.values(channel.presenceState()).flatMap((entries) =>
        (Array.isArray(entries) ? entries : []).flatMap((entry) => {
          const state = row(entry);
          const userId = text(state.userId);
          return isValidId(userId) ? [{ userId, onlineAt: text(state.onlineAt) || new Date().toISOString() }] : [];
        }));
      input.onPresence?.({
        participants: [...new Map(participants.map((participant) => [participant.userId, participant])).values()],
      });
    };

    channel
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter },
        (payload) => handleMessage("insert", payload))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter },
        (payload) => handleMessage("update", payload))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, handleDelete)
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" },
        (payload) => emitRelated("reaction", Object.keys(row(payload.new)).length ? row(payload.new) : row(payload.old)))
      .on("postgres_changes", { event: "*", schema: "public", table: "message_receipts" },
        (payload) => emitRelated("receipt", Object.keys(row(payload.new)).length ? row(payload.new) : row(payload.old)))
      .on("postgres_changes", { event: "*", schema: "public", table: "message_attachments" },
        (payload) => emitRelated("attachment", Object.keys(row(payload.new)).length ? row(payload.new) : row(payload.old)))
      .on("postgres_changes", { event: "*", schema: "public", table: "conversation_preferences", filter }, (payload) => {
        const next = row(payload.new);
        const previous = row(payload.old);
        const changed = Object.keys(next).length ? next : previous;
        if (text(changed.conversation_id) !== input.conversationId || text(changed.profile_id) !== input.userId) return;
        const version = text(changed.updated_at) || text(changed.created_at);
        if (!remember(`preferences:${input.userId}:${version}`)) return;
        input.onEvent({
          entity: "preferences",
          operation: "change",
          conversationId: input.conversationId,
          clearedBefore: text(changed.cleared_before) || null,
        });
      })
      .on("presence", { event: "sync" }, publishPresence)
      .on("broadcast", { event: "typing" }, (event) => {
        const payload = row(event.payload);
        const userId = text(payload.userId);
        const sentAt = text(payload.sentAt);
        if (!active || userId === input.userId || !isValidId(userId) || Number.isNaN(Date.parse(sentAt))) return;
        input.onTyping?.({ userId, isTyping: payload.isTyping === true, sentAt });
      })
      .on("system", {}, (payload) => {
        if (!active || payload.extension !== "system") return;
        if (payload.status !== "ok") {
          replicationReady = false;
          reportError(new Error("A sincronização da conversa ficou indisponível."));
          return;
        }
        replicationReady = true;
        activateRealtimeSession();
      })
      .subscribe((status, error) => {
        if (!active) return;
        if (status === "SUBSCRIBED") {
          subscribed = true;
          activateRealtimeSession();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          subscribed = false;
          replicationReady = false;
          presenceTracked = false;
          reportError(error);
        }
      });

    const setTyping = async (isTyping: boolean) => {
      if (!active || !subscribed || !replicationReady) return;
      const result = await channel.send({
        type: "broadcast",
        event: "typing",
        payload: { userId: input.userId, isTyping, sentAt: new Date().toISOString() },
      });
      if (result !== "ok") throw new Error("Não foi possível atualizar o indicador de digitação.");
    };

    const unsubscribe = () => {
      if (removed) return;
      removed = true;
      active = false;
      seen.clear();
      if (subscribed && replicationReady) {
        void channel.send({
          type: "broadcast",
          event: "typing",
          payload: { userId: input.userId, isTyping: false, sentAt: new Date().toISOString() },
        }).catch(() => undefined);
        if (presenceTracked) void channel.untrack().catch(() => undefined);
      }
      void this.client.removeChannel(channel);
    };

    return { setTyping, unsubscribe };
  }
}
