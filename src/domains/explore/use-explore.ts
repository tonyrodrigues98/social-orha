import { useCallback, useMemo } from "react";
import { useInfiniteQuery, type QueryKey } from "@tanstack/react-query";
import type { ExploreInterest, ExplorePage, ExplorePageRequest, ExplorePost } from "./types";
import { useExploreRepository } from "./explore-repository-context";

export type ExploreQueryStatus = "loading" | "ready" | "error";

export type ExplorePageQuery<T> = {
  items: T[];
  status: ExploreQueryStatus;
  error: string | null;
  hasMore: boolean;
  isLoadingMore: boolean;
  reload: () => Promise<void>;
  loadMore: () => Promise<void>;
};

const EXPLORE_PAGE_SIZE = 12;

export const exploreQueryKeys = {
  root: ["explore"] as const,
  interests: (search: string) => ["explore", "interests", search] as const,
  posts: (search: string) => ["explore", "public-posts", search] as const,
};

export function normalizeExploreSearch(value: string): string {
  return value.trim().slice(0, 80);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Não foi possível carregar a descoberta agora.";
}

function flattenPages<T>(pages: ExplorePage<T>[] | undefined, keyOf: (item: T) => string): T[] {
  const seen = new Set<string>();
  const items: T[] = [];
  for (const page of pages ?? []) {
    for (const item of page.items) {
      const key = keyOf(item);
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(item);
    }
  }
  return items;
}

function useExplorePage<T>({
  queryKey,
  load,
  keyOf,
}: {
  queryKey: QueryKey;
  load: (request: ExplorePageRequest) => Promise<ExplorePage<T>>;
  keyOf: (item: T) => string;
}): ExplorePageQuery<T> {
  const query = useInfiniteQuery({
    queryKey,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      load({ cursor: pageParam, limit: EXPLORE_PAGE_SIZE, signal }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 30_000,
  });
  const items = useMemo(
    () => flattenPages(query.data?.pages, keyOf),
    [keyOf, query.data?.pages],
  );

  return {
    items,
    status: query.isPending ? "loading" : query.isError ? "error" : "ready",
    error: query.error ? errorMessage(query.error) : null,
    hasMore: Boolean(query.hasNextPage),
    isLoadingMore: query.isFetchingNextPage,
    reload: async () => {
      await query.refetch();
    },
    loadMore: async () => {
      if (!query.hasNextPage || query.isFetchingNextPage) return;
      await query.fetchNextPage();
    },
  };
}

const interestKey = (interest: ExploreInterest) => interest.key;
const postKey = (post: ExplorePost) => post.id;

export function useExploreInterests(search = ""): ExplorePageQuery<ExploreInterest> {
  const repository = useExploreRepository();
  const normalizedSearch = normalizeExploreSearch(search);
  const load = useCallback(
    (request: ExplorePageRequest) =>
      repository.listInterests({ ...request, search: normalizedSearch }),
    [normalizedSearch, repository],
  );
  return useExplorePage({
    queryKey: exploreQueryKeys.interests(normalizedSearch),
    load,
    keyOf: interestKey,
  });
}

export function useExplorePublicPosts(search = ""): ExplorePageQuery<ExplorePost> {
  const repository = useExploreRepository();
  const normalizedSearch = normalizeExploreSearch(search);
  const load = useCallback(
    (request: ExplorePageRequest) =>
      repository.listPublicPosts({ ...request, search: normalizedSearch }),
    [normalizedSearch, repository],
  );
  return useExplorePage({
    queryKey: exploreQueryKeys.posts(normalizedSearch),
    load,
    keyOf: postKey,
  });
}
