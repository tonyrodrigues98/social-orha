import type { ConversationKind } from "./models";

export const messagingKeys = {
  root: ["messaging"] as const,
  conversationLists: (userId: string) => [...messagingKeys.root, "conversations", userId] as const,
  conversations: (userId: string, kind?: ConversationKind) =>
    [...messagingKeys.conversationLists(userId), kind ?? "all"] as const,
  conversation: (userId: string, conversationId: string) =>
    [...messagingKeys.root, "conversation", userId, conversationId] as const,
  requests: (userId: string, status = "all") =>
    [...messagingKeys.root, "requests", userId, status] as const,
  messages: (userId: string, conversationId: string) =>
    [...messagingKeys.root, "messages", userId, conversationId] as const,
  searches: (userId: string) => [...messagingKeys.root, "search", userId] as const,
  search: (userId: string, query: string, conversationId?: string) =>
    [...messagingKeys.searches(userId), conversationId ?? "all", query] as const,
  preferences: (userId: string, conversationId: string) =>
    [...messagingKeys.root, "preferences", userId, conversationId] as const,
};
