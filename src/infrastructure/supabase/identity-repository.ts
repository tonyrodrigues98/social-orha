import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AppRole,
  Profile,
  ProfileModerationState,
  ProfileDetails,
  ProfilePrivacy,
  UserIdentity,
} from "@/domain/identity";
import {
  favoriteDetailColumns,
  type FavoriteCategory,
  type FavoriteCollections,
  type FavoriteItem,
  type UserSettings,
  type UserSettingsUpdate,
} from "@/domain/profile-data";
import type { EditableProfileDetailsPatch } from "@/domain/profile-details";
import { getSupabaseClient } from "./client";

export type OwnProfileUpdate = Partial<Pick<
  Profile,
  | "full_name"
  | "username"
  | "birth_date"
  | "state_code"
  | "city"
  | "bio"
  | "church"
  | "avatar_path"
  | "onboarding_step"
>>;

export type OwnDetailsUpdate = EditableProfileDetailsPatch;

export type ProfilePrivacyUpdate = Pick<
  ProfilePrivacy,
  | "profile_visibility"
  | "age_visibility"
  | "location_visibility"
  | "favorites_visibility"
  | "gallery_visibility"
  | "dating_enabled"
>;

export type ProfileDataRepository = ReturnType<typeof createProfileDataRepository>;

type ProfileDataRepositoryOptions = {
  sleep?: (milliseconds: number) => Promise<void>;
};

const FUTURE_JWT_RETRY_DELAY_MS = 1_250;

function isFutureJwtError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  return candidate.code === "PGRST303"
    && typeof candidate.message === "string"
    && /jwt issued at future/i.test(candidate.message);
}

export function createProfileDataRepository(
  client: SupabaseClient,
  options: ProfileDataRepositoryOptions = {},
) {
  const sleep = options.sleep ?? ((milliseconds: number) =>
    new Promise<void>((resolve) => globalThis.setTimeout(resolve, milliseconds)));

  return {
    async loadIdentity(userId: string): Promise<UserIdentity> {
      const loadSnapshot = () => Promise.all([
        client.from("profiles").select("*").eq("id", userId).single(),
        client.from("profile_details").select("*").eq("profile_id", userId).single(),
        client.from("profile_privacy").select("*").eq("profile_id", userId).single(),
        client
          .from("profile_moderation_state")
          .select("profile_id,status,public_reason,restricted_until,created_at,updated_at")
          .eq("profile_id", userId)
          .single(),
        client.rpc("get_own_account_status"),
        client.from("user_roles").select("role").eq("user_id", userId).single(),
      ] as const);

      let snapshot = await loadSnapshot();
      let error = snapshot.find((result) => result.error)?.error ?? null;
      // Supabase Auth and PostgREST can briefly disagree on clock time directly
      // after issuing a token. Retry this one explicit transient once; every
      // other authentication or authorization error remains fail-closed.
      if (isFutureJwtError(error)) {
        await sleep(FUTURE_JWT_RETRY_DELAY_MS);
        snapshot = await loadSnapshot();
        error = snapshot.find((result) => result.error)?.error ?? null;
      }
      if (error) throw error;

      const [
        profileResult,
        detailsResult,
        privacyResult,
        moderationResult,
        accountStatusResult,
        roleResult,
      ] = snapshot;

      const accountStatusData = Array.isArray(accountStatusResult.data)
        ? accountStatusResult.data[0]
        : accountStatusResult.data;
      if (!accountStatusData || typeof accountStatusData !== "object") {
        throw new Error("O servidor não retornou o estado efetivo desta conta.");
      }
      const accountStatus = accountStatusData as {
        effective_status: ProfileModerationState["status"];
        recorded_status: ProfileModerationState["recorded_status"];
        access_enabled: boolean;
      };
      const recordedModeration = moderationResult.data as Omit<
        ProfileModerationState,
        "status" | "recorded_status" | "access_enabled"
      > & { status: ProfileModerationState["recorded_status"] };
      const privacy = privacyResult.data as Omit<ProfilePrivacy, "age_visibility"> & {
        age_visibility?: ProfilePrivacy["age_visibility"];
      };

      return {
        profile: profileResult.data as Profile,
        details: detailsResult.data as ProfileDetails,
        privacy: {
          ...privacy,
          age_visibility: privacy.age_visibility ?? "private",
        },
        moderationState: {
          ...recordedModeration,
          status: accountStatus.effective_status,
          recorded_status: accountStatus.recorded_status,
          access_enabled: accountStatus.access_enabled,
        },
        role: (roleResult.data?.role ?? "user") as AppRole,
      };
    },

    async updateProfile(userId: string, values: OwnProfileUpdate): Promise<Profile> {
      const { data, error } = await client
        .from("profiles")
        .update(values)
        .eq("id", userId)
        .select("*")
        .single();

      if (error) throw error;
      return data as Profile;
    },

    async completeOnboarding(userId: string): Promise<Profile> {
      const { data, error } = await client.rpc("complete_own_onboarding");

      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row || typeof row !== "object" || row.id !== userId) {
        throw new Error("O servidor não retornou a conclusão deste perfil.");
      }
      return row as Profile;
    },

    async updateDetails(userId: string, values: OwnDetailsUpdate): Promise<ProfileDetails> {
      const { data, error } = await client.rpc("update_own_profile_details", {
        p_patch: values,
      });

      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row || typeof row !== "object" || row.profile_id !== userId) {
        throw new Error("O servidor não retornou os detalhes atualizados deste perfil.");
      }
      return row as ProfileDetails;
    },

    async updatePrivacy(userId: string, values: ProfilePrivacyUpdate): Promise<ProfilePrivacy> {
      const { data, error } = await client
        .from("profile_privacy")
        .update(values)
        .eq("profile_id", userId)
        .select("*")
        .single();

      if (error) throw error;
      return data as ProfilePrivacy;
    },

    async updateFavorite(
      userId: string,
      category: FavoriteCategory,
      items: readonly FavoriteItem[],
    ): Promise<ProfileDetails> {
      const column = favoriteDetailColumns[category];
      const values: Partial<ProfileDetails> = { [column]: [...items] };
      const { data, error } = await client
        .from("profile_details")
        .update(values)
        .eq("profile_id", userId)
        .select("*")
        .single();

      if (error) throw error;
      return data as ProfileDetails;
    },

    async updateFavorites(
      userId: string,
      collections: FavoriteCollections,
    ): Promise<ProfileDetails> {
      const values = Object.fromEntries(
        (Object.keys(favoriteDetailColumns) as FavoriteCategory[]).map((category) => [
          favoriteDetailColumns[category],
          [...collections[category]],
        ]),
      ) as Partial<ProfileDetails>;
      const { data, error } = await client
        .from("profile_details")
        .update(values)
        .eq("profile_id", userId)
        .select("*")
        .single();

      if (error) throw error;
      return data as ProfileDetails;
    },

    async loadSettings(userId: string): Promise<UserSettings> {
      const { data, error } = await client
        .from("user_settings")
        .select("*")
        .eq("profile_id", userId)
        .single();
      if (error) throw error;
      return data as UserSettings;
    },

    async updateSettings(userId: string, values: UserSettingsUpdate): Promise<UserSettings> {
      const { data, error } = await client
        .from("user_settings")
        .update(values)
        .eq("profile_id", userId)
        .select("*")
        .single();
      if (error) throw error;
      return data as UserSettings;
    },

    async isUsernameAvailable(username: string): Promise<boolean> {
      const { data, error } = await client.rpc("username_is_available", {
        candidate: username,
      });
      if (error) throw error;
      return Boolean(data);
    },
  };
}

function repository() {
  return createProfileDataRepository(getSupabaseClient());
}

export function loadUserIdentity(userId: string): Promise<UserIdentity> {
  return repository().loadIdentity(userId);
}

export function updateOwnProfile(userId: string, values: OwnProfileUpdate): Promise<Profile> {
  return repository().updateProfile(userId, values);
}

export function completeOwnOnboarding(userId: string): Promise<Profile> {
  return repository().completeOnboarding(userId);
}

export function updateOwnDetails(userId: string, values: OwnDetailsUpdate): Promise<ProfileDetails> {
  return repository().updateDetails(userId, values);
}

export function updateOwnPrivacy(
  userId: string,
  values: ProfilePrivacyUpdate,
): Promise<ProfilePrivacy> {
  return repository().updatePrivacy(userId, values);
}

export function updateOwnFavorite(
  userId: string,
  category: FavoriteCategory,
  items: readonly FavoriteItem[],
): Promise<ProfileDetails> {
  return repository().updateFavorite(userId, category, items);
}

export function updateOwnFavorites(
  userId: string,
  collections: FavoriteCollections,
): Promise<ProfileDetails> {
  return repository().updateFavorites(userId, collections);
}

export function loadOwnSettings(userId: string): Promise<UserSettings> {
  return repository().loadSettings(userId);
}

export function updateOwnSettings(
  userId: string,
  values: UserSettingsUpdate,
): Promise<UserSettings> {
  return repository().updateSettings(userId, values);
}

export function isUsernameAvailable(username: string): Promise<boolean> {
  return repository().isUsernameAvailable(username);
}
