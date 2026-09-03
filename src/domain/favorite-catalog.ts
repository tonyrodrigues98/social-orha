import type {
  FavoriteCategory,
  FavoriteCollections,
  FavoriteItem,
} from "./profile-data";

export const favoriteCategories = [
  "movies",
  "series",
  "songs",
  "artists",
  "books",
  "games",
] as const satisfies readonly FavoriteCategory[];

export const favoriteCategoryLabels: Record<FavoriteCategory, string> = {
  movies: "Filmes",
  series: "Séries",
  songs: "Músicas",
  artists: "Artistas",
  books: "Livros",
  games: "Jogos",
};

export type FavoriteCatalogProvider =
  | "apple"
  | "tvmaze"
  | "openlibrary"
  | "cheapshark";

export const favoriteProviderByCategory: Record<
  FavoriteCategory,
  FavoriteCatalogProvider
> = {
  movies: "apple",
  series: "tvmaze",
  songs: "apple",
  artists: "apple",
  books: "openlibrary",
  games: "cheapshark",
};

export type FavoriteCatalogItem = FavoriteItem & {
  externalId: string;
  provider: FavoriteCatalogProvider;
};

export type FavoriteCatalogSearch = {
  category: FavoriteCategory;
  query: string;
  limit?: number;
};

export interface FavoriteCatalogRepository {
  search(
    request: FavoriteCatalogSearch,
    options?: { signal?: AbortSignal },
  ): Promise<FavoriteCatalogItem[]>;
}

export const MAX_FAVORITES_PER_CATEGORY = 5;
export const MIN_FAVORITE_SEARCH_LENGTH = 2;
export const MAX_FAVORITE_SEARCH_LENGTH = 80;
export const MAX_FAVORITE_SEARCH_RESULTS = 12;

export function emptyFavoriteCollections(): FavoriteCollections {
  return {
    movies: [],
    series: [],
    songs: [],
    artists: [],
    books: [],
    games: [],
  };
}

export function normalizeFavoriteSearchQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ").slice(0, MAX_FAVORITE_SEARCH_LENGTH);
}

export function favoriteItemKey(item: FavoriteItem): string {
  const externalId = item.externalId?.trim();
  if (externalId) return externalId.toLocaleLowerCase("en-US");
  return `legacy:${item.label.trim().toLocaleLowerCase("pt-BR")}`;
}

export function addFavoriteItem(
  current: readonly FavoriteItem[],
  item: FavoriteCatalogItem,
): FavoriteItem[] {
  if (current.length >= MAX_FAVORITES_PER_CATEGORY) return [...current];
  const key = favoriteItemKey(item);
  if (current.some((candidate) => favoriteItemKey(candidate) === key)) {
    return [...current];
  }
  return [...current, item];
}

export function moveFavoriteItem(
  current: readonly FavoriteItem[],
  fromIndex: number,
  toIndex: number,
): FavoriteItem[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= current.length ||
    toIndex >= current.length
  ) {
    return [...current];
  }
  const next = [...current];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function isFavoriteCatalogItem(value: unknown): value is FavoriteCatalogItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.label === "string" &&
    item.label.trim().length > 0 &&
    typeof item.externalId === "string" &&
    item.externalId.trim().length > 0 &&
    (item.provider === "apple" ||
      item.provider === "tvmaze" ||
      item.provider === "openlibrary" ||
      item.provider === "cheapshark")
  );
}
