import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Conversation,
  ConversationListInput,
  ConversationMemberRole,
  ConversationMemberStatus,
  ConversationParticipant,
  ConversationPreferences,
  ConversationRequest,
  ConversationRequestListInput,
  CursorPage,
  Message,
  MessageKind,
  MessageListInput,
  MessageMedia,
  MessageReaction,
  MessageReactionKind,
  MessageReceipt,
  MessageSearchInput,
  MessagingMediaRepository,
  MessagingRepository,
  MessagingSearchResult,
  PersistMessageCommand,
  UpdateConversationPreferences,
} from "@/domains/messaging";

const PROFILE_SELECT = "id,full_name,username,avatar_path";
const CONVERSATION_SELECT = `
  id,kind,title,created_by,direct_user_low,direct_user_high,created_at,updated_at,
  viewer_membership:conversation_members!inner(profile_id,role,status,created_at,updated_at),
  members:conversation_members(profile_id,role,status,profile:profiles(${PROFILE_SELECT})),
  preferences:conversation_preferences(profile_id,muted_until,archived_at,favorited_at,cleared_before,notifications_enabled,read_receipts_enabled,created_at,updated_at),
  recent_messages:messages(id,sender_id,kind,body,created_at)
`;
const REQUEST_SELECT = `
  id,requester_id,recipient_id,opening_message,status,conversation_id,created_at,responded_at,
  requester:profiles!conversation_requests_requester_id_fkey(${PROFILE_SELECT}),
  recipient:profiles!conversation_requests_recipient_id_fkey(${PROFILE_SELECT})
`;
const MESSAGE_SELECT = `
  id,client_message_id,conversation_id,sender_id,kind,body,reply_to_message_id,forwarded_from_message_id,created_at,edited_at,deleted_at,
  sender:profiles!messages_sender_id_fkey(${PROFILE_SELECT}),
  attachments:message_attachments(id,owner_id,bucket_id,object_path,mime_type,byte_size,duration_seconds,waveform,width,height),
  reply_to:messages!messages_reply_to_message_id_fkey(id,sender_id,kind,body,sender:profiles!messages_sender_id_fkey(full_name,username)),
  reactions:message_reactions(reactor_id,kind),
  receipts:message_receipts(profile_id,delivered_at,read_at)
`;

type DataRecord = Record<string, unknown>;

const REACTION_EMOJI: Record<MessageReactionKind, string> = {
  like: "👍",
  love: "❤️",
  amen: "🙏",
  pray: "🤲",
  support: "💜",
};

function record(value: unknown): DataRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as DataRecord;
}

function records(value: unknown): DataRecord[] {
  if (!Array.isArray(value)) return value ? [record(value)] : [];
  return value.map(record);
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function nullableString(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function messageKind(value: unknown): MessageKind {
  return value === "image" || value === "audio" || value === "file" || value === "system" ? value : "text";
}

function memberRole(value: unknown): ConversationMemberRole {
  return value === "owner" || value === "admin" ? value : "member";
}

function memberStatus(value: unknown): ConversationMemberStatus {
  return value === "invited" || value === "left" || value === "removed" ? value : "active";
}

function limited(input: number | undefined, fallback: number) {
  return Math.min(100, Math.max(1, input ?? fallback));
}

function validateCursor(cursor: { createdAt: string; id: string }) {
  if (Number.isNaN(Date.parse(cursor.createdAt)) || !/^[a-zA-Z0-9_-]{1,128}$/.test(cursor.id)) {
    throw new Error("Cursor de paginação inválido.");
  }
}

function cursorFilter(cursor: { createdAt: string; id: string }, column = "created_at") {
  validateCursor(cursor);
  return `${column}.lt.${cursor.createdAt},and(${column}.eq.${cursor.createdAt},id.lt.${cursor.id})`;
}

function reactionKindFromEmoji(emoji: string): MessageReactionKind {
  const normalized = emoji.trim().replaceAll("\uFE0F", "");
  if (normalized === "👍") return "like";
  if (normalized === "❤") return "love";
  if (normalized === "🙏") return "amen";
  if (normalized === "🤲") return "pray";
  if (normalized === "💜") return "support";
  throw new Error("Esta reação ainda não é permitida nesta conversa.");
}

function mediaKind(mimeType: string): "image" | "audio" | "file" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  return "file";
}

function fileNameFromPath(path: string) {
  const segment = path.split("/").at(-1) || "arquivo";
  const withoutIndex = segment.replace(/^\d+-/, "");
  try {
    return decodeURIComponent(withoutIndex);
  } catch {
    return withoutIndex;
  }
}

function escapeIlike(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function aggregateReactions(rows: DataRecord[]): MessageReaction[] {
  const groups = new Map<MessageReactionKind, Set<string>>();
  for (const row of rows) {
    const kind = stringValue(row.kind) as MessageReactionKind;
    if (!(kind in REACTION_EMOJI)) continue;
    const userId = stringValue(row.reactor_id);
    if (!userId) continue;
    const users = groups.get(kind) ?? new Set<string>();
    users.add(userId);
    groups.set(kind, users);
  }
  return [...groups].map(([kind, userIds]) => ({
    kind,
    emoji: REACTION_EMOJI[kind],
    userIds: [...userIds],
    count: userIds.size,
  }));
}

function mapPreferences(row: DataRecord, conversationId: string, userId: string): ConversationPreferences {
  return {
    conversationId,
    userId,
    mutedUntil: nullableString(row.muted_until),
    archivedAt: nullableString(row.archived_at),
    favoritedAt: nullableString(row.favorited_at),
    clearedBefore: nullableString(row.cleared_before),
    notificationsEnabled: booleanValue(row.notifications_enabled, true),
    readReceiptsEnabled: booleanValue(row.read_receipts_enabled, true),
    updatedAt: stringValue(row.updated_at, new Date(0).toISOString()),
  };
}

export class SupabaseMessagingRepository implements MessagingRepository {
  constructor(
    private readonly client: SupabaseClient,
    private readonly media: MessagingMediaRepository,
  ) {}

  async listConversations(input: ConversationListInput): Promise<CursorPage<Conversation>> {
    const limit = limited(input.limit, 24);
    let query = this.client
      .from("conversations")
      .select(CONVERSATION_SELECT)
      .eq("viewer_membership.profile_id", input.userId)
      .in("viewer_membership.status", ["active", "invited"])
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .order("created_at", { ascending: false, referencedTable: "recent_messages" })
      .limit(1, { referencedTable: "recent_messages" })
      .limit(limit);
    if (input.kind) query = query.eq("kind", input.kind);
    if (input.cursor) query = query.or(cursorFilter(input.cursor, "updated_at"));
    const { data, error } = await query;
    if (error) throw error;
    const rows = records(data);
    const unreadCounts = await this.loadUnreadCounts(rows.map((row) => stringValue(row.id)), input.userId);
    const items = await Promise.all(rows.map((row) => this.mapConversation(row, input.userId, unreadCounts)));
    const last = rows.at(-1);
    return {
      items,
      nextCursor: rows.length === limit && last
        ? { createdAt: stringValue(last.updated_at), id: stringValue(last.id) }
        : null,
    };
  }

  async getConversation(conversationId: string, userId: string): Promise<Conversation | null> {
    const { data, error } = await this.client
      .from("conversations")
      .select(CONVERSATION_SELECT)
      .eq("id", conversationId)
      .eq("viewer_membership.profile_id", userId)
      .in("viewer_membership.status", ["active", "invited"])
      .order("created_at", { ascending: false, referencedTable: "recent_messages" })
      .limit(1, { referencedTable: "recent_messages" })
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const unreadCounts = await this.loadUnreadCounts([conversationId], userId);
    return this.mapConversation(record(data), userId, unreadCounts);
  }

  async listConversationRequests(input: ConversationRequestListInput): Promise<CursorPage<ConversationRequest>> {
    const limit = limited(input.limit, 24);
    let query = this.client
      .from("conversation_requests")
      .select(REQUEST_SELECT)
      .or(`requester_id.eq.${input.userId},recipient_id.eq.${input.userId}`)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit);
    if (input.status) query = query.eq("status", input.status);
    if (input.cursor) query = query.or(cursorFilter(input.cursor));
    const { data, error } = await query;
    if (error) throw error;
    const rows = records(data);
    const items = await Promise.all(rows.map((row) => this.mapConversationRequest(row)));
    const last = rows.at(-1);
    return {
      items,
      nextCursor: rows.length === limit && last
        ? { createdAt: stringValue(last.created_at), id: stringValue(last.id) }
        : null,
    };
  }

  async requestConversation(input: { userId: string; targetUserId: string; openingMessage?: string | null }): Promise<ConversationRequest> {
    const { data, error } = await this.client.rpc("request_conversation", {
      p_target_profile_id: input.targetUserId,
      p_opening_message: input.openingMessage?.trim() || null,
    });
    if (error) throw error;
    return this.loadConversationRequest(stringValue(record(data).id));
  }

  async respondToConversationRequest(input: { userId: string; requestId: string; accept: boolean }): Promise<ConversationRequest> {
    const { data, error } = await this.client.rpc("respond_to_conversation_request", {
      p_request_id: input.requestId,
      p_accept: input.accept,
    });
    if (error) throw error;
    return this.loadConversationRequest(stringValue(record(data).id, input.requestId));
  }

  async createGroupConversation(input: { userId: string; title: string; memberIds: string[] }): Promise<Conversation> {
    const title = input.title.trim();
    if (!title || !input.memberIds.length) throw new Error("Informe o nome e pelo menos uma pessoa para o grupo.");
    const { data, error } = await this.client.rpc("create_group_conversation", {
      p_title: title,
      p_member_ids: [...new Set(input.memberIds)],
    });
    if (error) throw error;
    const id = stringValue(record(data).id);
    const conversation = id ? await this.getConversation(id, input.userId) : null;
    if (!conversation) throw new Error("O grupo foi criado, mas não pôde ser recarregado.");
    return conversation;
  }

  async respondToGroupInvitation(input: { userId: string; conversationId: string; accept: boolean }): Promise<void> {
    const { error } = await this.client.rpc("respond_to_group_invitation", {
      p_conversation_id: input.conversationId,
      p_accept: input.accept,
    });
    if (error) throw error;
  }

  async updateGroupMember(input: {
    userId: string;
    conversationId: string;
    memberId: string;
    action: "invite" | "remove" | "promote" | "demote";
  }): Promise<void> {
    const request = input.action === "invite"
      ? this.client.rpc("invite_group_members", { p_conversation_id: input.conversationId, p_member_ids: [input.memberId] })
      : input.action === "remove"
        ? this.client.rpc("remove_group_member", { p_conversation_id: input.conversationId, p_profile_id: input.memberId })
        : this.client.rpc("set_group_member_role", {
          p_conversation_id: input.conversationId,
          p_profile_id: input.memberId,
          p_role: input.action === "promote" ? "admin" : "member",
        });
    const { error } = await request;
    if (error) throw error;
  }

  async leaveGroupConversation(input: { userId: string; conversationId: string }): Promise<void> {
    const { error } = await this.client.rpc("leave_group_conversation", {
      p_conversation_id: input.conversationId,
    });
    if (error) throw error;
  }

  async transferGroupOwnership(input: { userId: string; conversationId: string; newOwnerId: string }): Promise<void> {
    const { error } = await this.client.rpc("transfer_group_ownership", {
      p_conversation_id: input.conversationId,
      p_new_owner_id: input.newOwnerId,
    });
    if (error) throw error;
  }

  async closeGroupConversation(input: { userId: string; conversationId: string }): Promise<void> {
    const { error } = await this.client.rpc("close_group_conversation", {
      p_conversation_id: input.conversationId,
    });
    if (error) throw error;
  }

  async listMessages(input: MessageListInput): Promise<CursorPage<Message>> {
    const limit = limited(input.limit, 50);
    const preferences = await this.getPreferences(input.conversationId, input.userId);
    let query = this.client
      .from("messages")
      .select(MESSAGE_SELECT)
      .eq("conversation_id", input.conversationId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit);
    if (preferences.clearedBefore) query = query.gt("created_at", preferences.clearedBefore);
    if (input.cursor) query = query.or(cursorFilter(input.cursor));
    const { data, error } = await query;
    if (error) throw error;
    const rows = records(data);
    const mapped = await Promise.all(rows.map((row) => this.mapMessage(row)));
    const last = rows.at(-1);
    return {
      items: mapped.reverse(),
      nextCursor: rows.length === limit && last
        ? { createdAt: stringValue(last.created_at), id: stringValue(last.id) }
        : null,
    };
  }

  async searchMessages(input: MessageSearchInput): Promise<CursorPage<MessagingSearchResult>> {
    const queryText = input.query.trim();
    if (queryText.length < 2) return { items: [], nextCursor: null };
    const limit = limited(input.limit, 30);
    let query = this.client
      .from("messages")
      .select(MESSAGE_SELECT)
      .is("deleted_at", null)
      .ilike("body", `%${escapeIlike(queryText)}%`)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit);
    if (input.conversationId) {
      query = query.eq("conversation_id", input.conversationId);
      const preferences = await this.getPreferences(input.conversationId, input.userId);
      if (preferences.clearedBefore) query = query.gt("created_at", preferences.clearedBefore);
    }
    if (input.cursor) query = query.or(cursorFilter(input.cursor));
    const { data, error } = await query;
    if (error) throw error;
    const rows = records(data);
    const mapped = await Promise.all(rows.map((row) => this.mapMessage(row)));
    const titleById = new Map<string, string>();
    await Promise.all([...new Set(mapped.map((message) => message.conversationId))].map(async (id) => {
      const conversation = await this.getConversation(id, input.userId);
      if (conversation) titleById.set(id, conversation.title);
    }));
    const last = rows.at(-1);
    return {
      items: mapped.map((message) => ({
        message,
        conversationTitle: titleById.get(message.conversationId) ?? "Conversa",
      })),
      nextCursor: rows.length === limit && last
        ? { createdAt: stringValue(last.created_at), id: stringValue(last.id) }
        : null,
    };
  }

  async getMessage(messageId: string): Promise<Message | null> {
    const { data, error } = await this.client.from("messages").select(MESSAGE_SELECT).eq("id", messageId).maybeSingle();
    if (error) throw error;
    return data ? this.mapMessage(record(data)) : null;
  }

  async sendMessage(command: PersistMessageCommand): Promise<Message> {
    if (!command.body?.trim() && command.media.length === 0) throw new Error("A mensagem está vazia.");
    if (command.kind !== "text" && command.kind !== "image" && command.kind !== "audio") {
      throw new Error("Arquivos genéricos não podem ser enviados nesta versão.");
    }
    if (command.media.length === 0 && command.kind !== "text") {
      throw new Error("Imagem e áudio precisam de uma mídia validada.");
    }
    if (command.media.length > 0 && command.kind !== command.media[0]?.kind) {
      throw new Error("O tipo da mensagem não corresponde à mídia selecionada.");
    }
    let messageId: string;
    if (command.media.length > 0) {
      if (command.media.length > 1) throw new Error("Uma mensagem pode conter apenas um anexo.");
      const item = command.media[0]!;
      const { data, error } = await this.client.functions.invoke("media-verify", {
        body: {
          scope: "message",
          conversationId: command.conversationId,
          clientMessageId: command.clientMessageId,
          kind: command.kind,
          body: command.body?.trim() || null,
          replyToMessageId: command.replyToMessageId ?? null,
          objectPath: item.storagePath,
          mimeType: item.mimeType,
          byteSize: item.sizeBytes,
          durationSeconds: item.durationSeconds,
          waveform: item.waveform,
          width: item.width,
          height: item.height,
        },
      });
      if (error) throw error;
      messageId = stringValue(record(record(data).message).id, stringValue(record(data).id));
    } else {
      const { data, error } = await this.client.rpc("send_message", {
        p_conversation_id: command.conversationId,
        p_kind: command.kind,
        p_body: command.body?.trim() || null,
        p_reply_to_message_id: command.replyToMessageId ?? null,
        p_client_message_id: command.clientMessageId,
      });
      if (error) throw error;
      messageId = stringValue(record(data).id);
    }
    if (!messageId) throw new Error("O Supabase não retornou a mensagem persistida.");

    const persisted = await this.getMessage(messageId);
    if (!persisted) throw new Error("A mensagem foi salva, mas não pôde ser recarregada.");
    return persisted;
  }

  async forwardMessage(input: {
    userId: string;
    sourceMessageId: string;
    targetConversationIds: string[];
    clientMessageIds: string[];
  }): Promise<Message[]> {
    if (input.targetConversationIds.length !== input.clientMessageIds.length) {
      throw new Error("Cada destino precisa de um identificador idempotente.");
    }
    return Promise.all(input.targetConversationIds.map(async (conversationId, index) => {
      const { data, error } = await this.client.rpc("forward_message", {
        p_source_message_id: input.sourceMessageId,
        p_target_conversation_id: conversationId,
        p_client_message_id: input.clientMessageIds[index],
      });
      if (error) throw error;
      const messageId = stringValue(record(data).id);
      const message = await this.getMessage(messageId);
      if (!message) throw new Error("A mensagem encaminhada não pôde ser recarregada.");
      return message;
    }));
  }

  async deleteMessage(input: { userId: string; messageId: string }): Promise<Message> {
    const { data, error } = await this.client.rpc("delete_message", { p_message_id: input.messageId });
    if (error) throw error;
    const messageId = stringValue(record(data).id, input.messageId);
    const message = await this.getMessage(messageId);
    if (!message) throw new Error("A mensagem excluída não pôde ser recarregada.");
    return message;
  }

  async setReaction(input: { conversationId: string; messageId: string; userId: string; emoji: string; active: boolean }): Promise<void> {
    const kind = reactionKindFromEmoji(input.emoji);
    if (input.active) {
      const { error } = await this.client.from("message_reactions").upsert({
        message_id: input.messageId,
        reactor_id: input.userId,
        kind,
      }, { onConflict: "message_id,reactor_id" });
      if (error) throw error;
      return;
    }
    const { error } = await this.client.from("message_reactions").delete()
      .eq("message_id", input.messageId).eq("reactor_id", input.userId);
    if (error) throw error;
  }

  async upsertReceipt(input: { conversationId: string; messageId: string; userId: string; kind: "delivered" | "read" }): Promise<void> {
    const { error } = await this.client.rpc(
      input.kind === "read" ? "mark_message_read" : "mark_message_delivered",
      { p_message_id: input.messageId },
    );
    if (error) throw error;
  }

  async getPreferences(conversationId: string, userId: string): Promise<ConversationPreferences> {
    const { data, error } = await this.client.from("conversation_preferences").select("*")
      .eq("conversation_id", conversationId).eq("profile_id", userId).maybeSingle();
    if (error) throw error;
    return mapPreferences(record(data), conversationId, userId);
  }

  async updatePreferences(
    conversationId: string,
    userId: string,
    patch: UpdateConversationPreferences,
  ): Promise<ConversationPreferences> {
    const payload: DataRecord = {};
    if ("mutedUntil" in patch) payload.muted_until = patch.mutedUntil;
    if ("archivedAt" in patch) payload.archived_at = patch.archivedAt;
    if ("notificationsEnabled" in patch) payload.notifications_enabled = patch.notificationsEnabled;
    if ("readReceiptsEnabled" in patch) payload.read_receipts_enabled = patch.readReceiptsEnabled;
    const { data, error } = await this.client.from("conversation_preferences").update(payload)
      .eq("conversation_id", conversationId).eq("profile_id", userId).select("*").single();
    if (error) throw error;
    return mapPreferences(record(data), conversationId, userId);
  }

  async setConversationFavorite(input: {
    conversationId: string;
    userId: string;
    favorited: boolean;
  }): Promise<ConversationPreferences> {
    const { data, error } = await this.client.rpc("set_conversation_favorite", {
      p_conversation_id: input.conversationId,
      p_favorited: input.favorited,
    });
    if (error) throw error;
    return mapPreferences(record(data), input.conversationId, input.userId);
  }

  async clearConversation(input: {
    conversationId: string;
    userId: string;
  }): Promise<ConversationPreferences> {
    const { data, error } = await this.client.rpc("clear_conversation_for_me", {
      p_conversation_id: input.conversationId,
    });
    if (error) throw error;
    return mapPreferences(record(data), input.conversationId, input.userId);
  }

  private async loadConversationRequest(requestId: string) {
    if (!requestId) throw new Error("O Supabase não retornou a solicitação de conversa.");
    const { data, error } = await this.client.from("conversation_requests").select(REQUEST_SELECT).eq("id", requestId).single();
    if (error) throw error;
    return this.mapConversationRequest(record(data));
  }

  private async mapConversationRequest(row: DataRecord): Promise<ConversationRequest> {
    return {
      id: stringValue(row.id),
      requester: await this.mapParticipant(record(row.requester), { profile_id: row.requester_id, role: "member", status: "active" }),
      recipient: await this.mapParticipant(record(row.recipient), { profile_id: row.recipient_id, role: "member", status: "active" }),
      openingMessage: nullableString(row.opening_message),
      status: row.status === "accepted" || row.status === "declined" || row.status === "cancelled" ? row.status : "pending",
      conversationId: nullableString(row.conversation_id),
      createdAt: stringValue(row.created_at),
      respondedAt: nullableString(row.responded_at),
    };
  }

  private async loadUnreadCounts(conversationIds: string[], userId: string) {
    const counts = new Map<string, number>();
    if (!conversationIds.length) return counts;
    const { data, error } = await this.client
      .from("message_receipts")
      .select("message_id,read_at,message:messages!inner(conversation_id)")
      .eq("profile_id", userId)
      .is("read_at", null)
      .in("message.conversation_id", conversationIds);
    if (error) throw error;
    for (const receipt of records(data)) {
      const conversationId = stringValue(record(receipt.message).conversation_id);
      if (conversationId) counts.set(conversationId, (counts.get(conversationId) ?? 0) + 1);
    }
    return counts;
  }

  private async mapConversation(row: DataRecord, userId: string, unreadCounts = new Map<string, number>()): Promise<Conversation> {
    const id = stringValue(row.id);
    const participants = await Promise.all(records(row.members).map((membership) =>
      this.mapParticipant(record(membership.profile), membership)));
    const otherParticipant = participants.find((participant) => participant.userId !== userId);
    const viewerMembership = records(row.viewer_membership).find((item) => stringValue(item.profile_id) === userId) ?? {};
    const preferenceRow = records(row.preferences).find((item) => stringValue(item.profile_id) === userId);
    const preferences = preferenceRow ? mapPreferences(preferenceRow, id, userId) : null;
    const clearedBeforeMs = preferences?.clearedBefore ? Date.parse(preferences.clearedBefore) : Number.NEGATIVE_INFINITY;
    const last = records(row.recent_messages).find((message) => {
      const createdAt = Date.parse(stringValue(message.created_at));
      return Number.isFinite(createdAt) && createdAt > clearedBeforeMs;
    });
    const isGroup = row.kind === "group";
    return {
      id,
      kind: isGroup ? "group" : "direct",
      title: isGroup ? stringValue(row.title, "Grupo") : otherParticipant?.displayName ?? "Conversa",
      avatarPath: isGroup ? null : otherParticipant?.avatarPath ?? null,
      avatarUrl: isGroup ? null : otherParticipant?.avatarUrl ?? null,
      participants,
      viewerRole: memberRole(viewerMembership.role),
      viewerStatus: memberStatus(viewerMembership.status),
      lastMessage: last ? {
        id: stringValue(last.id),
        senderId: stringValue(last.sender_id),
        kind: messageKind(last.kind),
        body: nullableString(last.body),
        createdAt: stringValue(last.created_at),
      } : null,
      unreadCount: last ? unreadCounts.get(id) ?? 0 : 0,
      preferences,
      updatedAt: stringValue(row.updated_at),
    };
  }

  private async mapParticipant(profile: DataRecord, membership: DataRecord): Promise<ConversationParticipant> {
    const avatarPath = nullableString(profile.avatar_path);
    return {
      userId: stringValue(membership.profile_id, stringValue(profile.id)),
      displayName: stringValue(profile.full_name, stringValue(profile.username, "Pessoa ORHA")),
      username: nullableString(profile.username),
      avatarPath,
      avatarUrl: avatarPath ? await this.media.createSignedUrl("profile-media", avatarPath).catch(() => null) : null,
      role: memberRole(membership.role),
      status: memberStatus(membership.status),
    };
  }

  private async mapMessage(row: DataRecord): Promise<Message> {
    const mediaWithoutUrls: Omit<MessageMedia, "signedUrl">[] = records(row.attachments).map((item) => {
      const mimeType = stringValue(item.mime_type, "application/octet-stream");
      const storagePath = stringValue(item.object_path);
      return {
        id: stringValue(item.id),
        kind: mediaKind(mimeType),
        bucket: stringValue(item.bucket_id, "chat-media"),
        storagePath,
        fileName: fileNameFromPath(storagePath),
        mimeType,
        sizeBytes: finiteNumber(item.byte_size) ?? 0,
        width: finiteNumber(item.width),
        height: finiteNumber(item.height),
        durationSeconds: finiteNumber(item.duration_seconds),
        waveform: Array.isArray(item.waveform)
          ? item.waveform.filter((value): value is number => typeof value === "number" && Number.isFinite(value)).slice(0, 256)
          : null,
      };
    });
    const sender = record(row.sender);
    const senderAvatarPath = nullableString(sender.avatar_path);
    const reply = records(row.reply_to)[0];
    const receipts = records(row.receipts).reduce<MessageReceipt[]>((result, item) => {
      const readAt = nullableString(item.read_at);
      const deliveredAt = nullableString(item.delivered_at);
      if (readAt) result.push({ userId: stringValue(item.profile_id), kind: "read", createdAt: readAt });
      else if (deliveredAt) result.push({ userId: stringValue(item.profile_id), kind: "delivered", createdAt: deliveredAt });
      return result;
    }, []);
    const deliveryState = receipts.some((receipt) => receipt.kind === "read")
      ? "read" as const
      : receipts.some((receipt) => receipt.kind === "delivered") ? "delivered" as const : "sent" as const;
    return {
      id: stringValue(row.id),
      clientMessageId: stringValue(row.client_message_id, stringValue(row.id)),
      conversationId: stringValue(row.conversation_id),
      senderId: stringValue(row.sender_id),
      senderName: stringValue(sender.full_name, stringValue(sender.username, "Pessoa ORHA")),
      senderAvatarUrl: senderAvatarPath
        ? await this.media.createSignedUrl("profile-media", senderAvatarPath).catch(() => null)
        : null,
      kind: messageKind(row.kind),
      body: nullableString(row.body),
      media: await this.media.hydrateMedia(mediaWithoutUrls),
      replyTo: reply ? {
        id: stringValue(reply.id),
        senderId: stringValue(reply.sender_id),
        senderName: stringValue(record(reply.sender).full_name, stringValue(record(reply.sender).username, "Pessoa ORHA")),
        kind: messageKind(reply.kind),
        body: nullableString(reply.body),
      } : null,
      forwardedFromMessageId: nullableString(row.forwarded_from_message_id),
      reactions: aggregateReactions(records(row.reactions)),
      receipts,
      deliveryState,
      createdAt: stringValue(row.created_at),
      editedAt: nullableString(row.edited_at),
      deletedAt: nullableString(row.deleted_at),
    };
  }
}
