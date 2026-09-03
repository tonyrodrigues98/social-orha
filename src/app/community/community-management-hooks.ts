import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CommunityAssetKind,
  CommunityMediaDimensions,
  CommunityPostMedia,
  CommunityRuleDraft,
  CommunityUpdate,
} from "@/domain/community-management";
import type { CommunityRole } from "@/domains/social";
import {
  getCommunityManagementRepository,
  type CommunityManagementRepository,
} from "@/infrastructure/supabase/community-management-repository";

const communityManagementKeys = {
  root: ["community-management"] as const,
  assets: (communityId: string) => ["community-management", communityId, "assets"] as const,
  postMedia: (postIds: readonly string[]) => [
    "community-management",
    "post-media",
    [...postIds].sort().join(","),
  ] as const,
};

function defaultRepository(): CommunityManagementRepository {
  return getCommunityManagementRepository();
}

export function useCommunityAssets(
  communityId: string,
  avatarPath: string | null,
  coverPath: string | null,
  repository?: CommunityManagementRepository,
) {
  return useQuery({
    queryKey: communityManagementKeys.assets(communityId),
    queryFn: () => (repository ?? defaultRepository()).resolveCommunityAssets({
      avatarPath,
      coverPath,
    }),
    enabled: Boolean(communityId && (avatarPath || coverPath)),
    staleTime: 45 * 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useCommunityPostMedia(
  postIds: readonly string[],
  repository?: CommunityManagementRepository,
) {
  const stableIds = [...postIds].sort();
  return useQuery({
    queryKey: communityManagementKeys.postMedia(stableIds),
    queryFn: ({ signal }) => (repository ?? defaultRepository()).listPostMedia(stableIds, signal),
    enabled: stableIds.length > 0,
    staleTime: 45 * 60_000,
    refetchOnWindowFocus: true,
  });
}

export function groupPostMediaByPost(
  media: readonly CommunityPostMedia[] | undefined,
): ReadonlyMap<string, readonly CommunityPostMedia[]> {
  const grouped = new Map<string, CommunityPostMedia[]>();
  for (const item of media ?? []) {
    const current = grouped.get(item.postId) ?? [];
    current.push(item);
    grouped.set(item.postId, current);
  }
  for (const items of grouped.values()) {
    items.sort((left, right) => left.sortOrder - right.sortOrder);
  }
  return grouped;
}

export function useCommunityManagementActions(
  communityId: string,
  repository?: CommunityManagementRepository,
) {
  const queryClient = useQueryClient();
  const repo = repository ?? defaultRepository();
  const invalidateCommunity = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["social", "community"] }),
    queryClient.invalidateQueries({ queryKey: ["social", "communities"] }),
    queryClient.invalidateQueries({ queryKey: communityManagementKeys.assets(communityId) }),
  ]);
  const invalidateRules = () => queryClient.invalidateQueries({
    queryKey: ["social", "community-rules"],
  });
  const invalidatePosts = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["social", "posts"] }),
    queryClient.invalidateQueries({ queryKey: communityManagementKeys.root }),
  ]);
  const invalidateComments = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["social", "comments"] }),
    queryClient.invalidateQueries({ queryKey: ["social", "posts"] }),
  ]);

  const updateCommunity = useMutation({
    mutationFn: (input: CommunityUpdate) => repo.updateCommunity(communityId, input),
    onSuccess: invalidateCommunity,
  });
  const archiveCommunity = useMutation({
    mutationFn: () => repo.archiveCommunity(communityId),
    onSuccess: invalidateCommunity,
  });
  const createRule = useMutation({
    mutationFn: (input: CommunityRuleDraft) => repo.createRule(communityId, input),
    onSuccess: invalidateRules,
  });
  const updateRule = useMutation({
    mutationFn: ({ ruleId, input }: { ruleId: string; input: CommunityRuleDraft }) =>
      repo.updateRule(ruleId, input),
    onSuccess: invalidateRules,
  });
  const deleteRule = useMutation({
    mutationFn: (ruleId: string) => repo.deleteRule(ruleId),
    onSuccess: invalidateRules,
  });
  const uploadCommunityAsset = useMutation({
    mutationFn: (input: {
      kind: CommunityAssetKind;
      file: File;
      dimensions: CommunityMediaDimensions;
      previousPath: string | null;
    }) => repo.uploadCommunityAsset({ communityId, ...input }),
    onSuccess: invalidateCommunity,
  });
  const uploadPostMedia = useMutation({
    mutationFn: (input: {
      postId: string;
      file: File;
      dimensions: CommunityMediaDimensions;
      sortOrder: number;
    }) => repo.uploadPostMedia(input),
    onSuccess: invalidatePosts,
  });
  const removePostMedia = useMutation({
    mutationFn: (media: CommunityPostMedia) => repo.removePostMedia(media),
    onSuccess: invalidatePosts,
  });
  const removePost = useMutation({
    mutationFn: (postId: string) => repo.removePost(postId),
    onSuccess: invalidatePosts,
  });
  const removeComment = useMutation({
    mutationFn: (commentId: string) => repo.removeComment(commentId),
    onSuccess: invalidateComments,
  });
  const setMemberRole = useMutation({
    mutationFn: ({
      profileId,
      role,
    }: {
      profileId: string;
      role: Exclude<CommunityRole, "owner">;
    }) => repo.setMemberRole(communityId, profileId, role),
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ["social", "memberships"] }),
      queryClient.invalidateQueries({ queryKey: ["social", "community"] }),
    ]),
  });
  const invalidateMemberships = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["social", "memberships"] }),
    queryClient.invalidateQueries({ queryKey: ["social", "community"] }),
  ]);
  const banMember = useMutation({
    mutationFn: ({ profileId, reason }: { profileId: string; reason: string }) =>
      repo.banMember(communityId, profileId, reason),
    onSuccess: invalidateMemberships,
  });
  const unbanMember = useMutation({
    mutationFn: (profileId: string) => repo.unbanMember(communityId, profileId),
    onSuccess: invalidateMemberships,
  });

  const errors = [
    updateCommunity.error,
    archiveCommunity.error,
    createRule.error,
    updateRule.error,
    deleteRule.error,
    uploadCommunityAsset.error,
    uploadPostMedia.error,
    removePostMedia.error,
    removePost.error,
    removeComment.error,
    setMemberRole.error,
    banMember.error,
    unbanMember.error,
  ];

  return {
    updateCommunity: updateCommunity.mutateAsync,
    archiveCommunity: archiveCommunity.mutateAsync,
    createRule: createRule.mutateAsync,
    updateRule: (ruleId: string, input: CommunityRuleDraft) =>
      updateRule.mutateAsync({ ruleId, input }),
    deleteRule: deleteRule.mutateAsync,
    uploadCommunityAsset: uploadCommunityAsset.mutateAsync,
    uploadPostMedia: uploadPostMedia.mutateAsync,
    removePostMedia: removePostMedia.mutateAsync,
    removePost: removePost.mutateAsync,
    removeComment: removeComment.mutateAsync,
    setMemberRole: (profileId: string, role: Exclude<CommunityRole, "owner">) =>
      setMemberRole.mutateAsync({ profileId, role }),
    banMember: (profileId: string, reason: string) =>
      banMember.mutateAsync({ profileId, reason }),
    unbanMember: unbanMember.mutateAsync,
    isPending: [
      updateCommunity,
      archiveCommunity,
      createRule,
      updateRule,
      deleteRule,
      uploadCommunityAsset,
      uploadPostMedia,
      removePostMedia,
      removePost,
      removeComment,
      setMemberRole,
      banMember,
      unbanMember,
    ].some((mutation) => mutation.isPending),
    error: errors.find((error): error is Error => error instanceof Error) ?? null,
  };
}
