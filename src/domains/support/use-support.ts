import { useCallback, useEffect, useMemo } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SupportError } from "./errors";
import type {
  CreateSupportTicketInput,
  SupportPage,
  SupportTicket,
  SupportTicketMessage,
  SupportTicketStatus,
  UpdateSupportTicketInput,
} from "./types";
import { useSupportRepository } from "./use-support-repository";

const PAGE_SIZE = 30;

export const supportQueryKeys = {
  root: ["support"] as const,
  tickets: (status: SupportTicketStatus | "all") => ["support", "tickets", status] as const,
  messages: (ticketId: string) => ["support", "messages", ticketId] as const,
};

function errorMessage(error: unknown) {
  if (error instanceof SupportError) return error.message;
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Não foi possível acessar o suporte agora.";
}

export function useSupportTickets(status: SupportTicketStatus | "all" = "all") {
  const repository = useSupportRepository();
  const query = useInfiniteQuery({
    queryKey: supportQueryKeys.tickets(status),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => repository.listTickets({
      status,
      cursor: pageParam,
      limit: PAGE_SIZE,
      signal,
    }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const items = useMemo(() => {
    const seen = new Set<string>();
    return (query.data?.pages ?? []).flatMap((page) => page.items).filter((ticket) => {
      if (seen.has(ticket.id)) return false;
      seen.add(ticket.id);
      return true;
    });
  }, [query.data?.pages]);

  return {
    items,
    status: query.isPending ? "loading" as const : query.isError ? "error" as const : "ready" as const,
    error: query.error ? errorMessage(query.error) : null,
    hasMore: Boolean(query.hasNextPage),
    isLoadingMore: query.isFetchingNextPage,
    reload: async () => { await query.refetch(); },
    loadMore: async () => {
      if (query.hasNextPage && !query.isFetchingNextPage) await query.fetchNextPage();
    },
  };
}

export function useSupportMessages(ticketId: string | null) {
  const repository = useSupportRepository();
  const query = useInfiniteQuery({
    queryKey: supportQueryKeys.messages(ticketId ?? "none"),
    enabled: Boolean(ticketId),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => {
      if (!ticketId) return Promise.resolve({ items: [], nextCursor: null } as SupportPage<SupportTicketMessage>);
      return repository.listMessages(ticketId, { cursor: pageParam, limit: 50, signal });
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const items = useMemo(() => {
    const seen = new Set<string>();
    const pages = [...(query.data?.pages ?? [])].reverse();
    return pages.flatMap((page) => [...page.items].reverse()).filter((message) => {
      if (seen.has(message.id)) return false;
      seen.add(message.id);
      return true;
    });
  }, [query.data?.pages]);

  return {
    items,
    status: !ticketId ? "idle" as const : query.isPending ? "loading" as const : query.isError ? "error" as const : "ready" as const,
    error: query.error ? errorMessage(query.error) : null,
    hasMore: Boolean(query.hasNextPage),
    isLoadingMore: query.isFetchingNextPage,
    reload: async () => { await query.refetch(); },
    loadMore: async () => {
      if (query.hasNextPage && !query.isFetchingNextPage) await query.fetchNextPage();
    },
  };
}

export function useSupportActions() {
  const repository = useSupportRepository();
  const queryClient = useQueryClient();
  const invalidate = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: supportQueryKeys.root });
  }, [queryClient]);

  const create = useMutation({
    mutationFn: (input: CreateSupportTicketInput) => repository.createTicket(input),
    onSuccess: invalidate,
  });
  const reply = useMutation({
    mutationFn: ({ ticketId, message }: { ticketId: string; message: string }) => repository.reply(ticketId, message),
    onSuccess: invalidate,
  });
  const claim = useMutation({
    mutationFn: (ticketId: string) => repository.claim(ticketId),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: (input: UpdateSupportTicketInput) => repository.updateTicket(input),
    onSuccess: invalidate,
  });

  return {
    create: create.mutateAsync,
    reply: reply.mutateAsync,
    claim: claim.mutateAsync,
    update: update.mutateAsync,
    isPending: create.isPending || reply.isPending || claim.isPending || update.isPending,
    error: errorMessage(create.error ?? reply.error ?? claim.error ?? update.error),
    hasError: Boolean(create.error ?? reply.error ?? claim.error ?? update.error),
    reset: () => { create.reset(); reply.reset(); claim.reset(); update.reset(); },
  };
}

export function useSupportRealtime() {
  const repository = useSupportRepository();
  const queryClient = useQueryClient();
  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => void) | null = null;
    void repository.subscribe((event) => {
      void queryClient.invalidateQueries({ queryKey: supportQueryKeys.root });
      void queryClient.invalidateQueries({ queryKey: supportQueryKeys.messages(event.ticketId) });
    }).then((cleanup) => {
      if (disposed) cleanup();
      else {
        unsubscribe = cleanup;
        void queryClient.invalidateQueries({ queryKey: supportQueryKeys.root });
      }
    }).catch(() => undefined);
    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [queryClient, repository]);
}

export function prependTicketToPage(
  page: SupportPage<SupportTicket>,
  ticket: SupportTicket,
): SupportPage<SupportTicket> {
  return { ...page, items: [ticket, ...page.items.filter((item) => item.id !== ticket.id)] };
}
