import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { normalizePublicProfileUsername } from "@/domain/public-profile";
import { useFriendshipActions, useFriendshipWith } from "@/domains/social";
import { useTrustRepository } from "@/domains/trust";
import {
  createSupabasePublicProfileRepository,
  type PublicProfileRepository,
} from "@/infrastructure/supabase/public-profile-repository";

export const publicProfileQueryKeys = {
  root: ["public-profile"] as const,
  profile: (username: string | null) => ["public-profile", "profile", username ?? "invalid"] as const,
  ownBlock: (username: string | null) => ["public-profile", "own-block", username ?? "invalid"] as const,
};

export function usePublicProfileRouteData(
  username: string,
  repository?: PublicProfileRepository,
) {
  const normalizedUsername = normalizePublicProfileUsername(username);
  const activeRepository = useMemo(
    () => repository ?? createSupabasePublicProfileRepository(),
    [repository],
  );
  const profileQuery = useQuery({
    queryKey: publicProfileQueryKeys.profile(normalizedUsername),
    queryFn: ({ signal }) => activeRepository.findByUsername(normalizedUsername!, signal),
    enabled: Boolean(normalizedUsername),
    staleTime: 30_000,
    retry: 1,
  });
  const blockQuery = useQuery({
    queryKey: publicProfileQueryKeys.ownBlock(normalizedUsername),
    queryFn: ({ signal }) => activeRepository.findOwnBlockByUsername(normalizedUsername!, signal),
    enabled: Boolean(normalizedUsername),
    staleTime: 30_000,
    retry: 1,
  });
  const friendshipQuery = useFriendshipWith(profileQuery.data?.id ?? null);

  return {
    normalizedUsername,
    profile: profileQuery.data ?? null,
    ownBlock: blockQuery.data ?? null,
    friendship: friendshipQuery.data,
    isLoading:
      Boolean(normalizedUsername)
      && (profileQuery.isPending
        || blockQuery.isPending
        || (Boolean(profileQuery.data) && friendshipQuery.status === "loading")),
    error:
      profileQuery.error
      ?? blockQuery.error
      ?? (friendshipQuery.error ? new Error(friendshipQuery.error) : null),
    reload: async () => {
      await Promise.all([
        profileQuery.refetch(),
        blockQuery.refetch(),
        friendshipQuery.reload(),
      ]);
    },
  };
}

export function usePublicProfileActions({
  profileId,
  username,
}: {
  profileId: string | null;
  username: string | null;
}) {
  const queryClient = useQueryClient();
  const trustRepository = useTrustRepository();
  const friendship = useFriendshipActions();
  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: publicProfileQueryKeys.root }),
      queryClient.invalidateQueries({ queryKey: ["social"] }),
      queryClient.invalidateQueries({ queryKey: ["trust"] }),
    ]);
  };
  const blockMutation = useMutation({
    mutationFn: async () => {
      if (!profileId) throw new Error("Este perfil não está disponível para bloqueio.");
      return trustRepository.blockProfile(profileId);
    },
    onSuccess: invalidate,
  });
  const unblockMutation = useMutation({
    mutationFn: async () => {
      if (!profileId) throw new Error("Este perfil não está disponível para desbloqueio.");
      await trustRepository.unblockProfile(profileId);
    },
    onSuccess: invalidate,
  });

  return {
    requestFriendship: friendship.request,
    respondFriendship: friendship.respond,
    removeFriendship: friendship.remove,
    block: blockMutation.mutateAsync,
    unblock: unblockMutation.mutateAsync,
    isPending:
      friendship.isPending || blockMutation.isPending || unblockMutation.isPending,
    error:
      friendship.error ?? blockMutation.error ?? unblockMutation.error,
    username,
  };
}
