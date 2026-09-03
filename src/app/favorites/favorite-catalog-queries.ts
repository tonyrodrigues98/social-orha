import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  MIN_FAVORITE_SEARCH_LENGTH,
  normalizeFavoriteSearchQuery,
  type FavoriteCatalogRepository,
} from "@/domain/favorite-catalog";
import type { FavoriteCategory } from "@/domain/profile-data";
import { getFavoriteCatalogRepository } from "@/infrastructure/supabase/favorite-catalog-repository";

export const favoriteCatalogQueryKeys = {
  search: (category: FavoriteCategory, query: string) => [
    "favorite-catalog",
    category,
    query,
  ] as const,
};

export function useDebouncedFavoriteQuery(value: string, delayMs = 350): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);
  return debounced;
}

export function useFavoriteCatalogSearch(
  category: FavoriteCategory,
  rawQuery: string,
  repository?: FavoriteCatalogRepository,
) {
  const query = normalizeFavoriteSearchQuery(rawQuery);
  return useQuery({
    queryKey: favoriteCatalogQueryKeys.search(category, query),
    queryFn: ({ signal }) => (repository ?? getFavoriteCatalogRepository()).search(
      { category, query, limit: 10 },
      { signal },
    ),
    enabled: query.length >= MIN_FAVORITE_SEARCH_LENGTH,
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
    retry: false,
  });
}
