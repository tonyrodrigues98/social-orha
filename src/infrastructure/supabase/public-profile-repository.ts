import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  OwnBlockedPublicProfile,
  PublicProfile,
} from "@/domain/public-profile";
import { favoriteItemsFromUnknown } from "@/domain/profile-data";
import { getSupabaseClient } from "./client";

type DatabaseRow = Record<string, unknown>;

export interface PublicProfileRepository {
  findByUsername(username: string, signal?: AbortSignal): Promise<PublicProfile | null>;
  findOwnBlockByUsername(
    username: string,
    signal?: AbortSignal,
  ): Promise<OwnBlockedPublicProfile | null>;
}

function rowsOf(value: unknown): DatabaseRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (row): row is DatabaseRow => Boolean(row) && typeof row === "object",
  );
}

function stringsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function favoriteValues(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function safeAge(value: unknown): number | null {
  return typeof value === "number"
    && Number.isInteger(value)
    && value >= 18
    && value <= 130
    ? value
    : null;
}

export function mapPublicProfileRow(row: DatabaseRow): PublicProfile {
  if (
    typeof row.profile_id !== "string"
    || typeof row.full_name !== "string"
    || typeof row.username !== "string"
  ) {
    throw new Error("O perfil retornado pelo servidor é inválido.");
  }
  return {
    id: row.profile_id,
    fullName: row.full_name,
    username: row.username,
    bio: textOrNull(row.bio),
    church: textOrNull(row.church),
    avatarPath: textOrNull(row.avatar_path),
    stateCode: textOrNull(row.state_code),
    city: textOrNull(row.city),
    ageYears: row.can_view_age === true ? safeAge(row.age_years) : null,
    personality: stringsOf(row.personality),
    favoriteSeason: textOrNull(row.favorite_season),
    socialEnergy: textOrNull(row.social_energy),
    weekendPreferences: stringsOf(row.weekend_preferences),
    visitedPlaces: stringsOf(row.visited_places),
    desiredPlaces: stringsOf(row.desired_places),
    interests: stringsOf(row.interests),
    hobbies: stringsOf(row.hobbies),
    favorites: {
      movies: favoriteItemsFromUnknown(favoriteValues(row.favorite_movies)),
      series: favoriteItemsFromUnknown(favoriteValues(row.favorite_series)),
      songs: favoriteItemsFromUnknown(favoriteValues(row.favorite_songs)),
      artists: favoriteItemsFromUnknown(favoriteValues(row.favorite_artists)),
      books: favoriteItemsFromUnknown(favoriteValues(row.favorite_books)),
      games: favoriteItemsFromUnknown(favoriteValues(row.favorite_games)),
    },
    canViewLocation: row.can_view_location === true,
    canViewAge: row.can_view_age === true,
    canViewFavorites: row.can_view_favorites === true,
    canViewGallery: row.can_view_gallery === true,
    isFriend: row.is_friend === true,
  };
}

function mapOwnBlockedProfile(row: DatabaseRow): OwnBlockedPublicProfile {
  if (
    typeof row.block_id !== "string"
    || typeof row.blocked_profile_id !== "string"
    || typeof row.username !== "string"
  ) {
    throw new Error("O bloqueio retornado pelo servidor é inválido.");
  }
  return {
    blockId: row.block_id,
    profileId: row.blocked_profile_id,
    fullName: textOrNull(row.full_name),
    username: row.username,
    avatarPath: textOrNull(row.avatar_path),
  };
}

function repositoryError(action: string, error: unknown): Error {
  return new Error(`Não foi possível ${action}.`, { cause: error });
}

export function createSupabasePublicProfileRepository(
  client: SupabaseClient = getSupabaseClient(),
): PublicProfileRepository {
  return {
    async findByUsername(username, signal) {
      let request = client.rpc("search_visible_profiles", {
        search_term: username,
        page_size: 10,
        page_offset: 0,
      });
      if (signal) request = request.abortSignal(signal);
      const { data, error } = await request;
      if (error) throw repositoryError("carregar este perfil", error);
      const exact = rowsOf(data).find(
        (row) =>
          typeof row.username === "string"
          && row.username.toLocaleLowerCase("pt-BR") === username,
      );
      if (!exact || typeof exact.profile_id !== "string") return null;

      let ageRequest = client.rpc("get_visible_profile_age", {
        p_profile_id: exact.profile_id,
      });
      if (signal) ageRequest = ageRequest.abortSignal(signal);
      const ageResult = await ageRequest;
      if (ageResult.error) throw repositoryError("carregar a idade deste perfil", ageResult.error);
      const ageRow = rowsOf(ageResult.data)[0] ?? {};
      return mapPublicProfileRow({
        ...exact,
        age_years: ageRow.age_years,
        can_view_age: ageRow.can_view_age,
      });
    },

    async findOwnBlockByUsername(username, signal) {
      let request = client.rpc("get_own_blocked_profile_by_username", {
        p_username: username,
      });
      if (signal) request = request.abortSignal(signal);
      const { data, error } = await request;
      if (error) throw repositoryError("verificar este bloqueio", error);
      const row = rowsOf(data)[0];
      return row ? mapOwnBlockedProfile(row) : null;
    },
  };
}
