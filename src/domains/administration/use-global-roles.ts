import { useMemo } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdministrationError } from "./errors";
import type { AssignGlobalRoleInput } from "./types";
import { useAdministrationRepository } from "./use-administration-repository";

const PAGE_SIZE = 30;

export const globalRoleQueryKeys = {
  root: ["administration", "global-roles"] as const,
  list: (query: string) => ["administration", "global-roles", query] as const,
};

function errorMessage(error: unknown) {
  if (error instanceof AdministrationError) return error.message;
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Não foi possível acessar as funções operacionais agora.";
}

export function useGlobalRoleAssignments(query = "") {
  const repository = useAdministrationRepository();
  const normalizedQuery = query.trim();
  const requestEnabled = normalizedQuery.length === 0 || normalizedQuery.length >= 2;
  const roleQuery = useInfiniteQuery({
    queryKey: globalRoleQueryKeys.list(normalizedQuery),
    enabled: requestEnabled,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => repository.listGlobalRoleAssignments({
      query: normalizedQuery || undefined,
      cursor: pageParam,
      limit: PAGE_SIZE,
      signal,
    }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const items = useMemo(() => {
    const seen = new Set<string>();
    return (roleQuery.data?.pages ?? []).flatMap((page) => page.items).filter((assignment) => {
      if (seen.has(assignment.userId)) return false;
      seen.add(assignment.userId);
      return true;
    });
  }, [roleQuery.data?.pages]);

  return {
    items,
    status: !requestEnabled
      ? "idle" as const
      : roleQuery.isPending
        ? "loading" as const
        : roleQuery.isError
          ? "error" as const
          : "ready" as const,
    error: roleQuery.error ? errorMessage(roleQuery.error) : null,
    hasMore: Boolean(roleQuery.hasNextPage),
    isLoadingMore: roleQuery.isFetchingNextPage,
    reload: async () => { await roleQuery.refetch(); },
    loadMore: async () => {
      if (roleQuery.hasNextPage && !roleQuery.isFetchingNextPage) await roleQuery.fetchNextPage();
    },
  };
}

export function useAssignGlobalRole() {
  const repository = useAdministrationRepository();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (input: AssignGlobalRoleInput) => repository.assignGlobalRole(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: globalRoleQueryKeys.root });
    },
  });
  return {
    assign: mutation.mutateAsync,
    isPending: mutation.isPending,
    error: mutation.error ? errorMessage(mutation.error) : null,
    reset: mutation.reset,
  };
}
