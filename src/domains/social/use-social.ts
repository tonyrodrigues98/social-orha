import { useCallback, useMemo } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import type {
  Community,
  CommunityMembership,
  CommunityPost,
  CommunityRule,
  CreateCommentInput,
  CreateCommunityInput,
  CreatePostInput,
  Friendship,
  FriendshipListRequest,
  MembershipListRequest,
  PostComment,
  PostListRequest,
  SetReactionInput,
  SocialPage,
  SocialPageRequest,
  SocialProfile,
} from "./types";
import { useSocialRepository } from "./social-repository-context";

export type SocialQueryStatus = "idle" | "loading" | "ready" | "error";

export type SocialPageState<T> = {
  items: T[];
  nextCursor: string | null;
  status: SocialQueryStatus;
  error: string | null;
  isLoadingMore: boolean;
};

export type SocialPageQuery<T> = SocialPageState<T> & {
  hasMore: boolean;
  reload: () => Promise<void>;
  loadMore: () => Promise<void>;
};

export type SocialEntityQuery<T> = {
  data: T | null;
  status: SocialQueryStatus;
  error: string | null;
  reload: () => Promise<void>;
};

const INITIAL_PAGE_SIZE = 20;

export const socialQueryKeys = {
  root: ["social"] as const,
  profiles: (search: string) => ["social", "profiles", search] as const,
  profile: (profileId: string | null) => ["social", "profile", profileId ?? "none"] as const,
  friendships: (status?: string, direction?: string) =>
    ["social", "friendships", status ?? "all", direction ?? "either"] as const,
  communities: (search: string, category?: string) =>
    ["social", "communities", search, category ?? "all"] as const,
  community: (communityId: string | null) => ["social", "community", communityId ?? "none"] as const,
  memberships: (communityId?: string, profileId?: string) =>
    ["social", "memberships", communityId ?? "all", profileId ?? "all"] as const,
  communityRules: (communityId: string | null) =>
    ["social", "community-rules", communityId ?? "none"] as const,
  posts: (communityId?: string, authorId?: string) =>
    ["social", "posts", communityId ?? "all", authorId ?? "all"] as const,
  post: (communityId: string | null, postId: string | null) =>
    ["social", "post", communityId ?? "none", postId ?? "none"] as const,
  comments: (postId: string | null) =>
    ["social", "comments", postId ?? "none"] as const,
};

function useSocialEntity<T>({
  queryKey,
  load,
  enabled,
}: {
  queryKey: QueryKey;
  load: (signal: AbortSignal) => Promise<T | null>;
  enabled: boolean;
}): SocialEntityQuery<T> {
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => load(signal),
    enabled,
    staleTime: 30_000,
  });
  return {
    data: query.data ?? null,
    status: !enabled
      ? "idle"
      : query.isPending
        ? "loading"
        : query.isError
          ? "error"
          : "ready",
    error: query.error ? toErrorMessage(query.error) : null,
    reload: async () => {
      await query.refetch();
    },
  };
}

export function mergeSocialPage<T>(
  currentItems: T[],
  nextPage: SocialPage<T>,
  append: boolean,
  getId: (item: T) => string,
): T[] {
  if (!append) return nextPage.items;

  const knownIds = new Set(currentItems.map(getId));
  return [
    ...currentItems,
    ...nextPage.items.filter((item) => !knownIds.has(getId(item))),
  ];
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Não foi possível carregar os dados agora.";
}

function flattenPages<T>(
  pages: SocialPage<T>[] | undefined,
  getId: (item: T) => string,
): T[] {
  return (pages ?? []).reduce<T[]>(
    (items, page) => mergeSocialPage(items, page, true, getId),
    [],
  );
}

function useSocialPage<T>({
  queryKey,
  load,
  getId,
  enabled = true,
}: {
  queryKey: QueryKey;
  load: (request: SocialPageRequest) => Promise<SocialPage<T>>;
  getId: (item: T) => string;
  enabled?: boolean;
}): SocialPageQuery<T> {
  const query = useInfiniteQuery({
    queryKey,
    enabled,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      load({ cursor: pageParam, limit: INITIAL_PAGE_SIZE, signal }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 30_000,
  });

  const items = useMemo(
    () => flattenPages(query.data?.pages, getId),
    [getId, query.data?.pages],
  );
  const nextCursor = query.data?.pages.at(-1)?.nextCursor ?? null;
  const reload = useCallback(async () => {
    await query.refetch();
  }, [query]);
  const loadMore = useCallback(async () => {
    if (!query.hasNextPage || query.isFetchingNextPage) return;
    await query.fetchNextPage();
  }, [query]);

  return {
    items,
    nextCursor,
    status: !enabled
      ? "idle"
      : query.isPending
        ? "loading"
        : query.isError
          ? "error"
          : "ready",
    error: query.error ? toErrorMessage(query.error) : null,
    isLoadingMore: query.isFetchingNextPage,
    hasMore: Boolean(query.hasNextPage),
    reload,
    loadMore,
  };
}

const byId = <T extends { id: string }>(item: T) => item.id;

export function useProfiles(search = ""): SocialPageQuery<SocialProfile> {
  const repository = useSocialRepository();
  const normalizedSearch = search.trim();
  const load = useCallback(
    (request: SocialPageRequest) =>
      repository.listProfiles({
        ...request,
        search: normalizedSearch || undefined,
      }),
    [normalizedSearch, repository],
  );
  return useSocialPage({
    queryKey: socialQueryKeys.profiles(normalizedSearch),
    load,
    getId: byId,
  });
}

export function useProfile(profileId: string | null): SocialEntityQuery<SocialProfile> {
  const repository = useSocialRepository();
  const load = useCallback(
    (signal: AbortSignal) =>
      profileId ? repository.getProfile(profileId, signal) : Promise.resolve(null),
    [profileId, repository],
  );
  return useSocialEntity({
    queryKey: socialQueryKeys.profile(profileId),
    load,
    enabled: Boolean(profileId),
  });
}

export function useFriendships(
  request: Pick<FriendshipListRequest, "status" | "direction"> = {},
): SocialPageQuery<Friendship> {
  const repository = useSocialRepository();
  const { status, direction } = request;
  const load = useCallback(
    (page: SocialPageRequest) =>
      repository.listFriendships({ ...page, status, direction }),
    [direction, repository, status],
  );
  return useSocialPage({
    queryKey: socialQueryKeys.friendships(status, direction),
    load,
    getId: byId,
  });
}

export function useFriendshipWith(profileId: string | null): SocialEntityQuery<Friendship> {
  const repository = useSocialRepository();
  const load = useCallback(
    (signal: AbortSignal) =>
      profileId
        ? repository.getFriendshipWith(profileId, signal)
        : Promise.resolve(null),
    [profileId, repository],
  );
  return useSocialEntity({
    queryKey: ["social", "friendship", profileId ?? "none"],
    load,
    enabled: Boolean(profileId),
  });
}

export function useCommunities(
  search = "",
  category?: string,
): SocialPageQuery<Community> {
  const repository = useSocialRepository();
  const normalizedSearch = search.trim();
  const load = useCallback(
    (request: SocialPageRequest) =>
      repository.listCommunities({
        ...request,
        search: normalizedSearch || undefined,
        category,
      }),
    [category, normalizedSearch, repository],
  );
  return useSocialPage({
    queryKey: socialQueryKeys.communities(normalizedSearch, category),
    load,
    getId: byId,
  });
}

export function useCommunity(communityId: string | null): SocialEntityQuery<Community> {
  const repository = useSocialRepository();
  const load = useCallback(
    (signal: AbortSignal) =>
      communityId
        ? repository.getCommunity(communityId, signal)
        : Promise.resolve(null),
    [communityId, repository],
  );
  return useSocialEntity({
    queryKey: socialQueryKeys.community(communityId),
    load,
    enabled: Boolean(communityId),
  });
}

export function useMemberships(
  request: Pick<MembershipListRequest, "communityId" | "profileId"> = {},
): SocialPageQuery<CommunityMembership> {
  const repository = useSocialRepository();
  const { communityId, profileId } = request;
  const load = useCallback(
    (page: SocialPageRequest) =>
      repository.listMemberships({ ...page, communityId, profileId }),
    [communityId, profileId, repository],
  );
  return useSocialPage({
    queryKey: socialQueryKeys.memberships(communityId, profileId),
    load,
    getId: (membership) =>
      `${membership.communityId}:${membership.profileId}`,
  });
}

export function useCommunityRules(
  communityId: string | null,
): SocialPageQuery<CommunityRule> {
  const repository = useSocialRepository();
  const load = useCallback(
    (request: SocialPageRequest) => {
      if (!communityId) return Promise.resolve({ items: [], nextCursor: null });
      return repository.listCommunityRules(communityId, request);
    },
    [communityId, repository],
  );
  return useSocialPage({
    queryKey: socialQueryKeys.communityRules(communityId),
    load,
    getId: byId,
    enabled: Boolean(communityId),
  });
}

export function usePosts(
  request: Pick<PostListRequest, "communityId" | "authorId"> = {},
): SocialPageQuery<CommunityPost> {
  const repository = useSocialRepository();
  const { communityId, authorId } = request;
  const load = useCallback(
    (page: SocialPageRequest) =>
      repository.listPosts({ ...page, communityId, authorId }),
    [authorId, communityId, repository],
  );
  return useSocialPage({
    queryKey: socialQueryKeys.posts(communityId, authorId),
    load,
    getId: byId,
  });
}

export function usePost(
  communityId: string | null,
  postId: string | null,
): SocialEntityQuery<CommunityPost> {
  const repository = useSocialRepository();
  const load = useCallback(
    (signal: AbortSignal) =>
      communityId && postId
        ? repository.getPost(communityId, postId, signal)
        : Promise.resolve(null),
    [communityId, postId, repository],
  );
  return useSocialEntity({
    queryKey: socialQueryKeys.post(communityId, postId),
    load,
    enabled: Boolean(communityId && postId),
  });
}

export function useComments(
  postId: string | null,
): SocialPageQuery<PostComment> {
  const repository = useSocialRepository();
  const load = useCallback(
    (request: SocialPageRequest) => {
      if (!postId) return Promise.resolve({ items: [], nextCursor: null });
      return repository.listComments(postId, request);
    },
    [postId, repository],
  );
  return useSocialPage({
    queryKey: socialQueryKeys.comments(postId),
    load,
    getId: byId,
    enabled: Boolean(postId),
  });
}

export function useFriendshipActions() {
  const repository = useSocialRepository();
  const queryClient = useQueryClient();
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["social", "friendships"] }),
      queryClient.invalidateQueries({ queryKey: ["social", "friendship"] }),
      queryClient.invalidateQueries({ queryKey: ["social", "profiles"] }),
    ]);
  const request = useMutation({
    mutationFn: (profileId: string) => repository.requestFriendship(profileId),
    onSuccess: invalidate,
  });
  const respond = useMutation({
    mutationFn: ({ friendshipId, accept }: { friendshipId: string; accept: boolean }) =>
      repository.respondToFriendship(friendshipId, accept),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (friendshipId: string) => repository.removeFriendship(friendshipId),
    onSuccess: invalidate,
  });

  return {
    request: request.mutateAsync,
    respond: (friendshipId: string, accept: boolean) =>
      respond.mutateAsync({ friendshipId, accept }),
    remove: remove.mutateAsync,
    isPending: request.isPending || respond.isPending || remove.isPending,
    error: request.error ?? respond.error ?? remove.error,
  };
}

export function useCommunityActions() {
  const repository = useSocialRepository();
  const queryClient = useQueryClient();
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["social", "communities"] }),
      queryClient.invalidateQueries({ queryKey: ["social", "community"] }),
      queryClient.invalidateQueries({ queryKey: ["social", "memberships"] }),
      queryClient.invalidateQueries({ queryKey: ["social", "posts"] }),
      queryClient.invalidateQueries({ queryKey: ["social", "post"] }),
      queryClient.invalidateQueries({ queryKey: ["social", "comments"] }),
    ]);
  const create = useMutation({
    mutationFn: (input: CreateCommunityInput) => repository.createCommunity(input),
    onSuccess: invalidate,
  });
  const join = useMutation({
    mutationFn: (communityId: string) => repository.joinCommunity(communityId),
    onSuccess: invalidate,
  });
  const leave = useMutation({
    mutationFn: (communityId: string) => repository.leaveCommunity(communityId),
    onSuccess: invalidate,
  });
  const respond = useMutation({
    mutationFn: ({
      communityId,
      profileId,
      accept,
    }: {
      communityId: string;
      profileId: string;
      accept: boolean;
    }) =>
      repository.respondToCommunityMembership(
        communityId,
        profileId,
        accept,
      ),
    onSuccess: invalidate,
  });

  return {
    create: create.mutateAsync,
    join: join.mutateAsync,
    leave: leave.mutateAsync,
    respond: (communityId: string, profileId: string, accept: boolean) =>
      respond.mutateAsync({ communityId, profileId, accept }),
    isPending:
      create.isPending || join.isPending || leave.isPending || respond.isPending,
    error: create.error ?? join.error ?? leave.error ?? respond.error,
  };
}

export function usePostActions() {
  const repository = useSocialRepository();
  const queryClient = useQueryClient();
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["social", "posts"] }),
      queryClient.invalidateQueries({ queryKey: ["social", "post"] }),
      queryClient.invalidateQueries({ queryKey: ["social", "comments"] }),
    ]);
  const createPost = useMutation({
    mutationFn: (input: CreatePostInput) => repository.createPost(input),
    onSuccess: invalidate,
  });
  const createComment = useMutation({
    mutationFn: (input: CreateCommentInput) => repository.createComment(input),
    onSuccess: invalidate,
  });
  const setReaction = useMutation({
    mutationFn: (input: SetReactionInput) => repository.setReaction(input),
    onSuccess: invalidate,
  });

  return {
    createPost: createPost.mutateAsync,
    createComment: createComment.mutateAsync,
    setReaction: setReaction.mutateAsync,
    isPending:
      createPost.isPending ||
      createComment.isPending ||
      setReaction.isPending,
    error:
      createPost.error ??
      createComment.error ??
      setReaction.error,
  };
}
