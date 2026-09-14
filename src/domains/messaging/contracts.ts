import type {
  Conversation,
  ConversationKind,
  ConversationMemberRole,
  ConversationPreferences,
  ConversationPresence,
  ConversationRequest,
  ConversationRequestStatus,
  CursorPage,
  Message,
  MessageMedia,
  MessageReceiptKind,
  MessagingCursor,
  MessagingSearchResult,
  NewMessageMedia,
  PersistMessageCommand,
  StoredMessageMedia,
  TypingState,
  UpdateConversationPreferences,
} from "./models";

export type ConversationListInput = Readonly<{
  userId: string;
  kind?: ConversationKind;
  cursor?: MessagingCursor | null;
  limit?: number;
}>;

export type ConversationRequestListInput = Readonly<{
  userId: string;
  status?: ConversationRequestStatus;
  cursor?: MessagingCursor | null;
  limit?: number;
}>;

export type MessageListInput = Readonly<{
  conversationId: string;
  userId: string;
  cursor?: MessagingCursor | null;
  limit?: number;
}>;

export type MessageSearchInput = Readonly<{
  userId: string;
  query: string;
  conversationId?: string;
  cursor?: MessagingCursor | null;
  limit?: number;
}>;

export interface MessagingRepository {
  listConversations(input: ConversationListInput): Promise<CursorPage<Conversation>>;
  getConversation(conversationId: string, userId: string): Promise<Conversation | null>;
  listConversationRequests(input: ConversationRequestListInput): Promise<CursorPage<ConversationRequest>>;
  requestConversation(input: {
    userId: string;
    targetUserId: string;
    openingMessage?: string | null;
  }): Promise<ConversationRequest>;
  respondToConversationRequest(input: {
    userId: string;
    requestId: string;
    accept: boolean;
  }): Promise<ConversationRequest>;
  createGroupConversation(input: {
    userId: string;
    title: string;
    memberIds: string[];
  }): Promise<Conversation>;
  respondToGroupInvitation(input: {
    userId: string;
    conversationId: string;
    accept: boolean;
  }): Promise<void>;
  updateGroupMember(input: {
    userId: string;
    conversationId: string;
    memberId: string;
    action: "invite" | "remove" | "promote" | "demote";
  }): Promise<void>;
  leaveGroupConversation(input: { userId: string; conversationId: string }): Promise<void>;
  transferGroupOwnership(input: {
    userId: string;
    conversationId: string;
    newOwnerId: string;
  }): Promise<void>;
  closeGroupConversation(input: { userId: string; conversationId: string }): Promise<void>;
  listMessages(input: MessageListInput): Promise<CursorPage<Message>>;
  searchMessages(input: MessageSearchInput): Promise<CursorPage<MessagingSearchResult>>;
  getMessage(messageId: string, userId: string): Promise<Message | null>;
  sendMessage(command: PersistMessageCommand): Promise<Message>;
  forwardMessage(input: {
    userId: string;
    sourceMessageId: string;
    targetConversationIds: string[];
    clientMessageIds: string[];
  }): Promise<Message[]>;
  deleteMessage(input: { userId: string; messageId: string }): Promise<Message>;
  setReaction(input: {
    conversationId: string;
    messageId: string;
    userId: string;
    emoji: string;
    active: boolean;
  }): Promise<void>;
  upsertReceipt(input: {
    conversationId: string;
    messageId: string;
    userId: string;
    kind: MessageReceiptKind;
  }): Promise<void>;
  getPreferences(conversationId: string, userId: string): Promise<ConversationPreferences>;
  updatePreferences(
    conversationId: string,
    userId: string,
    patch: UpdateConversationPreferences,
  ): Promise<ConversationPreferences>;
  setConversationFavorite(input: {
    conversationId: string;
    userId: string;
    favorited: boolean;
  }): Promise<ConversationPreferences>;
  clearConversation(input: {
    conversationId: string;
    userId: string;
  }): Promise<ConversationPreferences>;
}

export interface MessagingMediaRepository {
  upload(input: {
    conversationId: string;
    userId: string;
    clientMessageId: string;
    index: number;
    media: NewMessageMedia;
  }): Promise<StoredMessageMedia>;
  remove(bucket: string, storagePaths: string[]): Promise<void>;
  createSignedUrl(bucket: string, storagePath: string): Promise<string>;
  hydrateMedia(media: Omit<MessageMedia, "signedUrl">[]): Promise<MessageMedia[]>;
}

export type MessagingRealtimeEvent =
  | { entity: "sync"; operation: "ready"; conversationId: string }
  | { entity: "message"; operation: "insert" | "update"; conversationId: string; message: Message }
  | { entity: "message"; operation: "delete"; conversationId: string; messageId: string }
  | { entity: "reaction" | "receipt" | "attachment"; operation: "change"; conversationId: string; messageId?: string }
  | { entity: "preferences"; operation: "change"; conversationId: string; clearedBefore: string | null };

export type MessagingInboxRealtimeEvent = Readonly<{
  entity: "sync" | "request" | "membership" | "conversation" | "message" | "preferences";
  operation: "ready" | "insert" | "update" | "delete";
  conversationId?: string;
}>;

export type MessagingPresenceSnapshot = Readonly<{
  participants: ConversationPresence[];
}>;

export interface MessagingRealtimeSession {
  setTyping(isTyping: boolean): Promise<void>;
  unsubscribe(): void;
}

export interface MessagingRealtimeRepository {
  subscribeInbox(input: {
    userId: string;
    onEvent: (event: MessagingInboxRealtimeEvent) => void;
    onError?: (error: Error) => void;
  }): Pick<MessagingRealtimeSession, "unsubscribe">;
  subscribe(input: {
    conversationId: string;
    userId: string;
    onEvent: (event: MessagingRealtimeEvent) => void;
    onPresence?: (snapshot: MessagingPresenceSnapshot) => void;
    onTyping?: (state: TypingState) => void;
    onError?: (error: Error) => void;
  }): MessagingRealtimeSession;
}

export type MessagingServices = Readonly<{
  repository: MessagingRepository;
  media: MessagingMediaRepository;
  realtime: MessagingRealtimeRepository;
}>;

export type { ConversationMemberRole };
