import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UserIdentity } from "@/domain/identity";
import type {
  FavoriteCategory,
  FavoriteCollections,
  FavoriteItem,
  UserSettings,
  UserSettingsUpdate,
} from "@/domain/profile-data";
import type {
  ProcessedProfileImage,
  ProfileMedia,
  ProfileMediaPurpose,
  ProfileMediaWithUrl,
} from "@/domain/profile-media";
import { ProfileMediaService } from "@/application/profile-media/profile-media-service";
import {
  createProfileDataRepository,
  type OwnDetailsUpdate,
  type OwnProfileUpdate,
  type ProfileDataRepository,
  type ProfilePrivacyUpdate,
} from "@/infrastructure/supabase/identity-repository";
import { getSupabaseClient } from "@/infrastructure/supabase/client";
import { getProfileMediaAdapters } from "@/infrastructure/supabase/profile-media-repository";

export const profileQueryKeys = {
  all: ["profile"] as const,
  identity: (profileId: string) => ["profile", profileId, "identity"] as const,
  settings: (profileId: string) => ["profile", profileId, "settings"] as const,
  media: (profileId: string) => ["profile", profileId, "media"] as const,
};

const SIGNED_MEDIA_REFRESH_MS = 45 * 60_000;
const UNAVAILABLE_MEDIA_RETRY_MS = 30_000;

function defaultProfileRepository() {
  return createProfileDataRepository(getSupabaseClient());
}

function defaultMediaService() {
  const adapters = getProfileMediaAdapters();
  return new ProfileMediaService(adapters.repository, adapters.storage);
}

export function useOwnIdentityQuery(
  profileId: string,
  initialData?: UserIdentity,
  repository?: ProfileDataRepository,
) {
  return useQuery({
    queryKey: profileQueryKeys.identity(profileId),
    queryFn: () => (repository ?? defaultProfileRepository()).loadIdentity(profileId),
    initialData,
    initialDataUpdatedAt: initialData ? 0 : undefined,
    enabled: Boolean(profileId),
  });
}

export function useOwnProfileMediaQuery(
  profileId: string,
  service?: ProfileMediaService,
) {
  return useQuery({
    queryKey: profileQueryKeys.media(profileId),
    queryFn: () => (service ?? defaultMediaService()).listOwn(profileId),
    enabled: Boolean(profileId),
    staleTime: (query) => query.state.data?.some((item) => !item.readUrl)
      ? 0
      : SIGNED_MEDIA_REFRESH_MS,
    refetchInterval: (query) => query.state.data?.some((item) => !item.readUrl)
      ? UNAVAILABLE_MEDIA_RETRY_MS
      : SIGNED_MEDIA_REFRESH_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

export function useOwnProfileSettingsQuery(
  profileId: string,
  repository?: ProfileDataRepository,
) {
  return useQuery({
    queryKey: profileQueryKeys.settings(profileId),
    queryFn: () => (repository ?? defaultProfileRepository()).loadSettings(profileId),
    enabled: Boolean(profileId),
  });
}

export function useUpdateOwnProfileMutation(
  profileId: string,
  repository?: ProfileDataRepository,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: OwnProfileUpdate) => (
      repository ?? defaultProfileRepository()
    ).updateProfile(profileId, values),
    onSuccess: (profile) => {
      queryClient.setQueryData<UserIdentity>(
        profileQueryKeys.identity(profileId),
        (current) => current ? { ...current, profile } : current,
      );
    },
  });
}

export function useCompleteOwnOnboardingMutation(
  profileId: string,
  repository?: ProfileDataRepository,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => (
      repository ?? defaultProfileRepository()
    ).completeOnboarding(profileId),
    onSuccess: (profile) => {
      queryClient.setQueryData<UserIdentity>(
        profileQueryKeys.identity(profileId),
        (current) => current ? { ...current, profile } : current,
      );
    },
  });
}

export function useUpdateOwnDetailsMutation(
  profileId: string,
  repository?: ProfileDataRepository,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: OwnDetailsUpdate) => (
      repository ?? defaultProfileRepository()
    ).updateDetails(profileId, values),
    onSuccess: (details) => {
      queryClient.setQueryData<UserIdentity>(
        profileQueryKeys.identity(profileId),
        (current) => current ? { ...current, details } : current,
      );
    },
  });
}

export function useUpdateOwnPrivacyMutation(
  profileId: string,
  repository?: ProfileDataRepository,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: ProfilePrivacyUpdate) => (
      repository ?? defaultProfileRepository()
    ).updatePrivacy(profileId, values),
    onSuccess: (privacy) => {
      queryClient.setQueryData<UserIdentity>(
        profileQueryKeys.identity(profileId),
        (current) => current ? { ...current, privacy } : current,
      );
      void queryClient.invalidateQueries({ queryKey: profileQueryKeys.settings(profileId) });
    },
  });
}

export function useUpdateOwnSettingsMutation(
  profileId: string,
  repository?: ProfileDataRepository,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: UserSettingsUpdate) => (
      repository ?? defaultProfileRepository()
    ).updateSettings(profileId, values),
    onSuccess: (settings) => {
      queryClient.setQueryData<UserSettings>(
        profileQueryKeys.settings(profileId),
        settings,
      );
    },
  });
}

export function useUpdateOwnFavoriteMutation(
  profileId: string,
  repository?: ProfileDataRepository,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ category, items }: { category: FavoriteCategory; items: readonly FavoriteItem[] }) => (
      repository ?? defaultProfileRepository()
    ).updateFavorite(profileId, category, items),
    onSuccess: (details) => {
      queryClient.setQueryData<UserIdentity>(
        profileQueryKeys.identity(profileId),
        (current) => current ? { ...current, details } : current,
      );
    },
  });
}

export function useUpdateOwnFavoritesMutation(
  profileId: string,
  repository?: ProfileDataRepository,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (collections: FavoriteCollections) => (
      repository ?? defaultProfileRepository()
    ).updateFavorites(profileId, collections),
    onSuccess: (details) => {
      queryClient.setQueryData<UserIdentity>(
        profileQueryKeys.identity(profileId),
        (current) => current ? { ...current, details } : current,
      );
    },
  });
}

export function useUploadProfileMediaMutation(
  profileId: string,
  service?: ProfileMediaService,
) {
  const queryClient = useQueryClient();
  return useMutation({
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: profileQueryKeys.media(profileId) });
    },
    mutationFn: async ({ purpose, image }: {
      purpose: ProfileMediaPurpose;
      image: ProcessedProfileImage;
    }) => {
      const mediaService = service ?? defaultMediaService();
      const previous = purpose === "gallery"
        ? undefined
        : queryClient
          .getQueryData<ProfileMediaWithUrl[]>(profileQueryKeys.media(profileId))
          ?.find((item) => item.purpose === purpose);
      const uploaded = await mediaService.upload(purpose, image);
      if (previous && previous.id !== uploaded.id) {
        await mediaService.remove(previous).catch(() => undefined);
      }
      return uploaded;
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: profileQueryKeys.media(profileId) });
    },
  });
}

export function useRemoveProfileMediaMutation(
  profileId: string,
  service?: ProfileMediaService,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (media: ProfileMedia) => (service ?? defaultMediaService()).remove(media),
    onMutate: async (removed) => {
      await queryClient.cancelQueries({ queryKey: profileQueryKeys.media(profileId) });
      const previous = queryClient.getQueryData<ProfileMediaWithUrl[]>(
        profileQueryKeys.media(profileId),
      );
      if (previous) {
        queryClient.setQueryData<ProfileMediaWithUrl[]>(
          profileQueryKeys.media(profileId),
          previous.filter((item) => item.id !== removed.id),
        );
      }
      return { previous };
    },
    onError: (_error, _removed, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          profileQueryKeys.media(profileId),
          context.previous,
        );
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: profileQueryKeys.media(profileId) });
    },
  });
}
