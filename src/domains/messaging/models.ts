export type ConversationKind = "direct" | "group";
export type ConversationMemberRole = "owner" | "admin" | "member";
export type ConversationMemberStatus = "invited" | "active" | "left" | "removed";
export type ConversationRequestStatus = "pending" | "accepted" | "declined" | "cancelled";
export type MessageKind = "text" | "image" | "audio" | "file" | "system";
export type MessageDeliveryState = "sending" | "sent" | "delivered" | "read" | "failed";
export type MessageReceiptKind = "delivered" | "read";
export type MessageMediaKind = "image" | "audio" | "file";
export type OutboundMessageKind = "text" | "image" | "audio";
export type OutboundMessageMediaKind = Exclude<OutboundMessageKind, "text">;
export type MessageReactionKind = "like" | "love" | "amen" | "pray" | "support";

export type MessagingCursor = Readonly<{
  createdAt: string;
  id: string;
}>;

export type CursorPage<T> = Readonly<{
  items: T[];
  nextCursor: MessagingCursor | null;
}>;

export type ConversationParticipant = Readonly<{
  userId: string;
  displayName: string;
  username: string | null;
  avatarPath: string | null;
  avatarUrl: string | null;
  role: ConversationMemberRole;
  status: ConversationMemberStatus;
}>;

export type MessagePreview = Readonly<{
  id: string;
  senderId: string;
  kind: MessageKind;
  body: string | null;
  createdAt: string;
}>;

export type ConversationPreferences = Readonly<{
  conversationId: string;
  userId: string;
  mutedUntil: string | null;
  archivedAt: string | null;
  favoritedAt: string | null;
  clearedBefore: string | null;
  notificationsEnabled: boolean;
  readReceiptsEnabled: boolean;
  updatedAt: string;
}>;

export type Conversation = Readonly<{
  id: string;
  kind: ConversationKind;
  title: string;
  avatarPath: string | null;
  avatarUrl: string | null;
  participants: ConversationParticipant[];
  viewerRole: ConversationMemberRole;
  viewerStatus: ConversationMemberStatus;
  lastMessage: MessagePreview | null;
  unreadCount: number;
  preferences: ConversationPreferences | null;
  updatedAt: string;
}>;

export type ConversationRequest = Readonly<{
  id: string;
  requester: ConversationParticipant;
  recipient: ConversationParticipant;
  openingMessage: string | null;
  status: ConversationRequestStatus;
  conversationId: string | null;
  createdAt: string;
  respondedAt: string | null;
}>;

export type MessageMedia = Readonly<{
  id: string;
  kind: MessageMediaKind;
  bucket: string;
  storagePath: string;
  signedUrl: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  waveform: number[] | null;
}>;

export type MessageReaction = Readonly<{
  kind: MessageReactionKind;
  emoji: string;
  userIds: string[];
  count: number;
}>;

export type MessageReceipt = Readonly<{
  userId: string;
  kind: MessageReceiptKind;
  createdAt: string;
}>;

export type MessageReply = Readonly<{
  id: string;
  senderId: string;
  senderName: string;
  kind: MessageKind;
  body: string | null;
}>;

export type Message = Readonly<{
  id: string;
  clientMessageId: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatarUrl: string | null;
  kind: MessageKind;
  body: string | null;
  media: MessageMedia[];
  replyTo: MessageReply | null;
  forwardedFromMessageId: string | null;
  reactions: MessageReaction[];
  receipts: MessageReceipt[];
  deliveryState: MessageDeliveryState;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
}>;

export type NewMessageMedia = Readonly<{
  kind: OutboundMessageMediaKind;
  blob: Blob;
  fileName: string;
  mimeType: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  waveform?: number[];
}>;

export type StoredMessageMedia = Omit<MessageMedia, "id" | "kind"> & Readonly<{
  kind: OutboundMessageMediaKind;
}>;

export type SendMessageDraft = Readonly<{
  conversationId: string;
  senderId: string;
  senderName: string;
  clientMessageId: string;
  kind: OutboundMessageKind;
  body?: string | null;
  replyToMessageId?: string | null;
  media?: NewMessageMedia[];
}>;

export type PersistMessageCommand = Omit<SendMessageDraft, "media"> & Readonly<{
  media: StoredMessageMedia[];
}>;

export type UpdateConversationPreferences = Readonly<{
  mutedUntil?: string | null;
  archivedAt?: string | null;
  notificationsEnabled?: boolean;
  readReceiptsEnabled?: boolean;
}>;

export type MessagingSearchResult = Readonly<{
  message: Message;
  conversationTitle: string;
}>;

export type ConversationPresence = Readonly<{
  userId: string;
  onlineAt: string;
}>;

export type TypingState = Readonly<{
  userId: string;
  isTyping: boolean;
  sentAt: string;
}>;

export function createClientMessageId(): string {
  const bytes = new Uint8Array(16);
  const cryptoApi = (globalThis as typeof globalThis & { crypto?: Crypto }).crypto;
  if (cryptoApi) cryptoApi.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}
