import type { ProfileDetails } from "./identity";

export type FavoriteCategory =
  | "movies"
  | "series"
  | "songs"
  | "artists"
  | "books"
  | "games";

export type FavoriteItem = {
  label: string;
  externalId?: string;
  provider?: string;
  subtitle?: string;
  /** @deprecated Legacy field kept only while old persisted rows are migrated. */
  source?: string;
  imageUrl?: string;
};

export type FavoriteCollections = Record<FavoriteCategory, FavoriteItem[]>;

export const favoriteDetailColumns: Record<
  FavoriteCategory,
  keyof Pick<
    ProfileDetails,
    | "favorite_movies"
    | "favorite_series"
    | "favorite_songs"
    | "favorite_artists"
    | "favorite_books"
    | "favorite_games"
  >
> = {
  movies: "favorite_movies",
  series: "favorite_series",
  songs: "favorite_songs",
  artists: "favorite_artists",
  books: "favorite_books",
  games: "favorite_games",
};

export type UserSettings = {
  profile_id: string;
  locale: string;
  timezone_name: string;
  reduced_motion: boolean;
  high_contrast: boolean;
  analytics_enabled: boolean;
  analytics_consent_updated_at: string | null;
  created_at: string;
  updated_at: string;
};

export type UserSettingsUpdate = Partial<Pick<
  UserSettings,
  "locale" | "timezone_name" | "reduced_motion" | "high_contrast" | "analytics_enabled"
>>;

export function favoriteItemsFromUnknown(values: unknown[]): FavoriteItem[] {
  return values.flatMap((value) => {
    if (typeof value === "string") return [{ label: value }];
    if (!value || typeof value !== "object") return [];
    const item = value as Record<string, unknown>;
    const label = String(item.label ?? item.name ?? item.title ?? "").trim();
    if (!label) return [];
    const legacySource = typeof item.source === "string" ? item.source.trim() : "";
    return [{
      label,
      externalId: typeof item.externalId === "string" ? item.externalId : undefined,
      provider: typeof item.provider === "string"
        ? item.provider
        : legacySource || undefined,
      subtitle: typeof item.subtitle === "string" ? item.subtitle : undefined,
      source: legacySource || undefined,
      imageUrl: typeof item.imageUrl === "string" ? item.imageUrl : undefined,
    }];
  }).slice(0, 5);
}

export function favoriteCollectionsFromDetails(details: ProfileDetails): FavoriteCollections {
  return {
    movies: favoriteItemsFromUnknown(details.favorite_movies),
    series: favoriteItemsFromUnknown(details.favorite_series),
    songs: favoriteItemsFromUnknown(details.favorite_songs),
    artists: favoriteItemsFromUnknown(details.favorite_artists),
    books: favoriteItemsFromUnknown(details.favorite_books),
    games: favoriteItemsFromUnknown(details.favorite_games),
  };
}
