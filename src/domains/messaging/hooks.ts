import { useCallback, useEffect, useRef, useState } from "react";
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  MessagingInboxRealtimeEvent,
  MessagingRealtimeEvent,
  MessagingRealtimeSession,
} from "./contracts";
import { mergeMessagePage } from "./cache";
import {
  createClientMessageId,
  type ConversationKind,
  type ConversationPreferences,
  type ConversationRequestStatus,
  type CursorPage,
  type Message,
  type MessageReactionKind,
  type MessagingCursor,
  type SendMessageDraft,
  type UpdateConversationPreferences,
} from "./models";
import { useMessagingServices } from "./messaging-context";
import { messagingKeys } from "./query-keys";

const CONVERSATION_PAGE_SIZE = 24;
const MESSAGE_PAGE_SIZE = 50;
const TYPING_TTL_MS = 4_000;

export function useConversationsQuery(userId: string, kind?: ConversationKind) {
  const { repository } = useMessagingServices();
  return useInfiniteQuery({
    queryKey: messagingKeys.conversations(userId, kind),
    queryFn: ({ pageParam }) => repository.listConversations({
      userId,
      kind,
      cursor: pageParam,
      limit: CONVERSATION_PAGE_SIZE,
    }),
    initialPageParam: null as MessagingCursor | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: Boolean(userId),
    staleTime: 30_000,
  });
}

export function useConversationQuery(conversationId: string, userId: string) {
  const { repository } = useMessagingServices();
  return useQuery({
    queryKey: messagingKeys.conversation(userId, conversationId),
    queryFn: () => repository.getConversation(conversationId, userId),
    enabled: Boolean(conversationId && userId),
    staleTime: 30_000,
  });
}

export function useConversationRequestsQuery(userId: string, status: ConversationRequestStatus = "pending") {
  const { repository } = useMessagingServices();
  return useInfiniteQuery({
    queryKey: messagingKeys.requests(userId, status),
    queryFn: ({ pageParam }) => repository.listConversationRequests({
      userId,
      status,
      cursor: pageParam,
      limit: CONVERSATION_PAGE_SIZE,
    }),
    initialPageParam: null as MessagingCursor | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: Boolean(userId),
    staleTime: 20_000,
  });
}

export function useMessagingInboxRealtime(userId: string) {
  const { realtime } = useMessagingServices();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;
    const handleEvent = (event: MessagingInboxRealtimeEvent) => {
      if (event.entity === "request" || event.entity === "sync") {
        void queryClient.invalidateQueries({ queryKey: messagingKeys.requestLists(userId) });
      }
      if (event.entity !== "request") {
        void queryClient.invalidateQueries({ queryKey: messagingKeys.conversationLists(userId) });
      }
      if (event.conversationId) {
        void queryClient.invalidateQueries({
          queryKey: messagingKeys.conversation(userId, event.conversationId),
        });
      }
    };
    const session = realtime.subscribeInbox({ userId, onEvent: handleEvent });
    return () => session.unsubscribe();
  }, [queryClient, realtime, userId]);
}

export function useMessagesQuery(conversationId: string, userId: string) {
  const { repository } = useMessagingServices();
  return useInfiniteQuery({
    queryKey: messagingKeys.messages(userId, conversationId),
    queryFn: ({ pageParam }) => repository.listMessages({
      conversationId,
      userId,
      cursor: pageParam,
      limit: MESSAGE_PAGE_SIZE,
    }),
    initialPageParam: null as MessagingCursor | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: Boolean(conversationId && userId),
    staleTime: 20_000,
  });
}

export function useMessageSearchQuery(userId: string, query: string, conversationId?: string) {
  const { repository } = useMessagingServices();
  const normalized = query.trim();
  return useInfiniteQuery({
    queryKey: messagingKeys.search(userId, normalized, conversationId),
    queryFn: ({ pageParam }) => repository.searchMessages({
      userId,
      query: normalized,
      conversationId,
      cursor: pageParam,
      limit: 30,
    }),
    initialPageParam: null as MessagingCursor | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: Boolean(userId && normalized.length >= 2),
    staleTime: 15_000,
  });
}

function optimisticMessage(draft: SendMessageDraft): Message {
  return {
    id: `optimistic:${draft.clientMessageId}`,
    clientMessageId: draft.clientMessageId,
    conversationId: draft.conversationId,
    senderId: draft.senderId,
    senderName: draft.senderName,
    senderAvatarUrl: null,
    kind: draft.kind,
    body: draft.body?.trim() || null,
    media: [],
    replyTo: null,
    forwardedFromMessageId: null,
    reactions: [],
    receipts: [],
    deliveryState: "sending",
    createdAt: new Date().toISOString(),
    editedAt: null,
    deletedAt: null,
  };
}

export function useSendMessageMutation() {
  const { repository, media } = useMessagingServices();
  const queryClient = useQueryClient();

  return useMutation({
    retry: 1,
    retryDelay: 750,
    mutationFn: async (draft: SendMessageDraft) => {
      const uploadedMedia = [];
      try {
        for (const [index, item] of (draft.media ?? []).entries()) {
          uploadedMedia.push(await media.upload({
            conversationId: draft.conversationId,
            userId: draft.senderId,
            clientMessageId: draft.clientMessageId,
            index,
            media: item,
          }));
        }
        return await repository.sendMessage({ ...draft, media: uploadedMedia });
      } catch (error) {
        const byBucket = new Map<string, string[]>();
        for (const item of uploadedMedia) byBucket.set(item.bucket, [...(byBucket.get(item.bucket) ?? []), item.storagePath]);
        await Promise.all([...byBucket].map(([bucket, paths]) => media.remove(bucket, paths).catch(() => undefined)));
        throw error;
      }
    },
    onMutate: async (draft) => {
      const queryKey = messagingKeys.messages(draft.senderId, draft.conversationId);
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<InfiniteData<CursorPage<Message>>>(queryKey);
      const optimistic = optimisticMessage(draft);
      queryClient.setQueryData(queryKey, mergeMessagePage(previous, optimistic));
      return { previous, optimistic, queryKey };
    },
    onError: (_error, _draft, context) => {
      if (!context) return;
      queryClient.setQueryData(
        context.queryKey,
        mergeMessagePage(context.previous, { ...context.optimistic, deliveryState: "failed" }),
      );
    },
    onSuccess: (message, _draft, context) => {
      if (!context) return;
      queryClient.setQueryData<InfiniteData<CursorPage<Message>>>(
        context.queryKey,
        (current) => mergeMessagePage(current, message),
      );
    },
    onSettled: (_data, _error, draft) => {
      void queryClient.invalidateQueries({ queryKey: messagingKeys.conversationLists(draft.senderId) });
    },
  });
}

function reactionKind(emoji: string): MessageReactionKind {
  const value = emoji.replaceAll("\uFE0F", "");
  if (value === "❤") return "love";
  if (value === "🙏") return "amen";
  if (value === "🤲") return "pray";
  if (value === "💜") return "support";
  return "like";
}

function applyReaction(message: Message, userId: string, emoji: string, active: boolean): Message {
  const current = message.reactions.find((reaction) => reaction.emoji === emoji);
  const userIds = new Set(current?.userIds ?? []);
  if (active) userIds.add(userId);
  else userIds.delete(userId);
  const reactions = message.reactions.filter((reaction) => reaction.emoji !== emoji);
  if (userIds.size) reactions.push({ kind: current?.kind ?? reactionKind(emoji), emoji, userIds: [...userIds], count: userIds.size });
  return { ...message, reactions };
}

export function useReactionMutation() {
  const { repository } = useMessagingServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { conversationId: string; messageId: string; userId: string; emoji: string; active: boolean }) =>
      repository.setReaction(input),
    onMutate: async (input) => {
      const queryKey = messagingKeys.messages(input.userId, input.conversationId);
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<InfiniteData<CursorPage<Message>>>(queryKey);
      if (previous) {
        queryClient.setQueryData<InfiniteData<CursorPage<Message>>>(queryKey, {
          ...previous,
          pages: previous.pages.map((page) => ({
            ...page,
            items: page.items.map((message) => message.id === input.messageId
              ? applyReaction(message, input.userId, input.emoji, input.active)
              : message),
          })),
        });
      }
      return { previous, queryKey };
    },
    onError: (_error, _input, context) => {
      if (context) queryClient.setQueryData(context.queryKey, context.previous);
    },
  });
}

export function useReceiptMutation() {
  const { repository } = useMessagingServices();
  return useMutation({
    mutationFn: (input: { conversationId: string; messageId: string; userId: string; kind: "delivered" | "read" }) =>
      repository.upsertReceipt(input),
  });
}

export function useDeleteMessageMutation() {
  const { repository } = useMessagingServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { conversationId: string; messageId: string; userId: string }) => repository.deleteMessage(input),
    onSuccess: (message, input) => {
      const key = messagingKeys.messages(input.userId, input.conversationId);
      queryClient.setQueryData<InfiniteData<CursorPage<Message>>>(key, (current) => mergeMessagePage(current, message));
      void queryClient.invalidateQueries({ queryKey: messagingKeys.conversationLists(input.userId) });
    },
  });
}

export function useForwardMessageMutation() {
  const { repository } = useMessagingServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { userId: string; sourceMessageId: string; targetConversationIds: string[]; clientMessageIds?: string[] }) => repository.forwardMessage({
      ...input,
      clientMessageIds: input.clientMessageIds ?? input.targetConversationIds.map(() => createClientMessageId()),
    }),
    onSuccess: (messages, input) => {
      for (const message of messages) {
        const key = messagingKeys.messages(input.userId, message.conversationId);
        queryClient.setQueryData<InfiniteData<CursorPage<Message>>>(key, (current) => mergeMessagePage(current, message));
      }
      void queryClient.invalidateQueries({ queryKey: messagingKeys.conversationLists(input.userId) });
    },
  });
}

export function useConversationRequestMutation() {
  const { repository } = useMessagingServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { userId: string; targetUserId: string; openingMessage?: string | null }) => repository.requestConversation(input),
    onSuccess: (_request, input) => {
      void queryClient.invalidateQueries({ queryKey: messagingKeys.requestLists(input.userId) });
      void queryClient.invalidateQueries({ queryKey: messagingKeys.conversationLists(input.userId) });
    },
  });
}

export function useRespondConversationRequestMutation() {
  const { repository } = useMessagingServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { userId: string; requestId: string; accept: boolean }) => repository.respondToConversationRequest(input),
    onSuccess: (_request, input) => {
      void queryClient.invalidateQueries({ queryKey: messagingKeys.requestLists(input.userId) });
      void queryClient.invalidateQueries({ queryKey: messagingKeys.conversationLists(input.userId) });
    },
  });
}

export function useCreateGroupMutation() {
  const { repository } = useMessagingServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { userId: string; title: string; memberIds: string[] }) => repository.createGroupConversation(input),
    onSuccess: (_conversation, input) => {
      void queryClient.invalidateQueries({ queryKey: messagingKeys.conversationLists(input.userId) });
    },
  });
}

export function useRespondGroupInvitationMutation() {
  const { repository } = useMessagingServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { userId: string; conversationId: string; accept: boolean }) => repository.respondToGroupInvitation(input),
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: messagingKeys.conversationLists(input.userId) });
      void queryClient.invalidateQueries({ queryKey: messagingKeys.conversation(input.userId, input.conversationId) });
    },
  });
}

export function useUpdateGroupMemberMutation() {
  const { repository } = useMessagingServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      userId: string;
      conversationId: string;
      memberId: string;
      action: "invite" | "remove" | "promote" | "demote";
    }) => repository.updateGroupMember(input),
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: messagingKeys.conversation(input.userId, input.conversationId) });
    },
  });
}

export function useGroupLifecycleMutation() {
  const { repository } = useMessagingServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input:
      | { action: "leave"; userId: string; conversationId: string }
      | { action: "close"; userId: string; conversationId: string }
      | { action: "transfer"; userId: string; conversationId: string; newOwnerId: string }
    ) => {
      if (input.action === "leave") return repository.leaveGroupConversation(input);
      if (input.action === "close") return repository.closeGroupConversation(input);
      return repository.transferGroupOwnership(input);
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: messagingKeys.conversationLists(input.userId) });
      void queryClient.invalidateQueries({ queryKey: messagingKeys.conversation(input.userId, input.conversationId) });
    },
  });
}

export function usePreferencesQuery(conversationId: string, userId: string) {
  const { repository } = useMessagingServices();
  return useQuery({
    queryKey: messagingKeys.preferences(userId, conversationId),
    queryFn: () => repository.getPreferences(conversationId, userId),
    enabled: Boolean(conversationId && userId),
  });
}

export function usePreferencesMutation(conversationId: string, userId: string) {
  const { repository } = useMessagingServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: UpdateConversationPreferences) => repository.updatePreferences(conversationId, userId, patch),
    onSuccess: (preferences) => {
      queryClient.setQueryData(messagingKeys.preferences(userId, conversationId), preferences);
      void queryClient.invalidateQueries({ queryKey: messagingKeys.conversationLists(userId) });
      void queryClient.invalidateQueries({ queryKey: messagingKeys.conversation(userId, conversationId) });
    },
  });
}

export function useFavoriteConversationMutation(conversationId: string, userId: string) {
  const { repository } = useMessagingServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (favorited: boolean) => repository.setConversationFavorite({ conversationId, userId, favorited }),
    onSuccess: (preferences) => {
      queryClient.setQueryData(messagingKeys.preferences(userId, conversationId), preferences);
      void queryClient.invalidateQueries({ queryKey: messagingKeys.conversationLists(userId) });
      void queryClient.invalidateQueries({ queryKey: messagingKeys.conversation(userId, conversationId) });
    },
  });
}

export function useClearConversationMutation(conversationId: string, userId: string) {
  const { repository } = useMessagingServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => repository.clearConversation({ conversationId, userId }),
    onSuccess: (preferences) => {
      queryClient.setQueryData(messagingKeys.preferences(userId, conversationId), preferences);
      queryClient.setQueryData<InfiniteData<CursorPage<Message>>>(
        messagingKeys.messages(userId, conversationId),
        { pages: [{ items: [], nextCursor: null }], pageParams: [null] },
      );
      void queryClient.invalidateQueries({ queryKey: messagingKeys.messages(userId, conversationId) });
      void queryClient.invalidateQueries({ queryKey: messagingKeys.searches(userId) });
      void queryClient.invalidateQueries({ queryKey: messagingKeys.conversationLists(userId) });
      void queryClient.invalidateQueries({ queryKey: messagingKeys.conversation(userId, conversationId) });
    },
  });
}

export function useConversationRealtime(conversationId: string, userId: string) {
  const { realtime } = useMessagingServices();
  const queryClient = useQueryClient();
  const sessionRef = useRef<MessagingRealtimeSession | null>(null);
  const typingTimersRef = useRef(new Map<string, number>());
  const [presentUserIds, setPresentUserIds] = useState<string[]>([]);
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);

  useEffect(() => {
    if (!conversationId || !userId) return;
    const typingTimers = typingTimersRef.current;
    const handleEvent = (event: MessagingRealtimeEvent) => {
      const messagesKey = messagingKeys.messages(userId, conversationId);
      if (event.entity === "message" && event.operation !== "delete") {
        queryClient.setQueryData<InfiniteData<CursorPage<Message>>>(
          messagesKey,
          (current) => mergeMessagePage(current, event.message),
        );
      } else {
        void queryClient.invalidateQueries({ queryKey: messagesKey });
      }
      if (event.entity === "preferences") {
        const nextWatermark = event.clearedBefore ? Date.parse(event.clearedBefore) : Number.NaN;
        const currentPreferences = queryClient.getQueryData<ConversationPreferences>(
          messagingKeys.preferences(userId, conversationId),
        );
        const currentWatermark = currentPreferences?.clearedBefore
          ? Date.parse(currentPreferences.clearedBefore)
          : Number.NEGATIVE_INFINITY;
        if (Number.isFinite(nextWatermark) && nextWatermark > currentWatermark) {
          queryClient.setQueryData<InfiniteData<CursorPage<Message>>>(messagesKey, (current) => current ? {
            ...current,
            pages: current.pages.map((page) => ({
              ...page,
              items: page.items.filter((message) => Date.parse(message.createdAt) > nextWatermark),
            })),
          } : current);
          if (currentPreferences) {
            queryClient.setQueryData(
              messagingKeys.preferences(userId, conversationId),
              { ...currentPreferences, clearedBefore: event.clearedBefore },
            );
          }
        }
        void queryClient.invalidateQueries({ queryKey: messagingKeys.preferences(userId, conversationId) });
      }
      void queryClient.invalidateQueries({ queryKey: messagingKeys.conversation(userId, conversationId) });
      void queryClient.invalidateQueries({ queryKey: messagingKeys.conversationLists(userId) });
    };

    const session = realtime.subscribe({
      conversationId,
      userId,
      onEvent: handleEvent,
      onPresence: ({ participants }) => setPresentUserIds(participants.map((participant) => participant.userId)),
      onTyping: ({ userId: typingUserId, isTyping }) => {
        const oldTimer = typingTimers.get(typingUserId);
        if (oldTimer) window.clearTimeout(oldTimer);
        if (!isTyping) {
          typingTimers.delete(typingUserId);
          setTypingUserIds((current) => current.filter((id) => id !== typingUserId));
          return;
        }
        setTypingUserIds((current) => current.includes(typingUserId) ? current : [...current, typingUserId]);
        typingTimers.set(typingUserId, window.setTimeout(() => {
          typingTimers.delete(typingUserId);
          setTypingUserIds((current) => current.filter((id) => id !== typingUserId));
        }, TYPING_TTL_MS));
      },
    });
    sessionRef.current = session;

    return () => {
      session.unsubscribe();
      if (sessionRef.current === session) sessionRef.current = null;
      for (const timer of typingTimers.values()) window.clearTimeout(timer);
      typingTimers.clear();
      setPresentUserIds([]);
      setTypingUserIds([]);
    };
  }, [conversationId, queryClient, realtime, userId]);

  const setTyping = useCallback((isTyping: boolean) => {
    void sessionRef.current?.setTyping(isTyping).catch(() => undefined);
  }, []);

  return { presentUserIds, typingUserIds, setTyping };
}
