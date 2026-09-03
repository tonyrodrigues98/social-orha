import {
  isFavoriteCatalogItem,
  favoriteProviderByCategory,
  MAX_FAVORITE_SEARCH_RESULTS,
  MIN_FAVORITE_SEARCH_LENGTH,
  normalizeFavoriteSearchQuery,
  type FavoriteCatalogItem,
  type FavoriteCatalogRepository,
  type FavoriteCatalogSearch,
} from "@/domain/favorite-catalog";
import { getSupabaseClient } from "./client";

type CatalogResponse = { items?: unknown };
type CatalogFunctionInvoker = {
  invoke<T>(
    functionName: string,
    options: {
      body: Record<string, unknown>;
      signal?: AbortSignal;
      timeout?: number;
    },
  ): Promise<{ data: T | null; error: unknown }>;
};

export class FavoriteCatalogUnavailableError extends Error {
  constructor(message = "Não foi possível consultar o catálogo agora.") {
    super(message);
    this.name = "FavoriteCatalogUnavailableError";
  }
}

export class SupabaseFavoriteCatalogRepository implements FavoriteCatalogRepository {
  constructor(private readonly functions: CatalogFunctionInvoker) {}

  async search(
    request: FavoriteCatalogSearch,
    options: { signal?: AbortSignal } = {},
  ): Promise<FavoriteCatalogItem[]> {
    const query = normalizeFavoriteSearchQuery(request.query);
    if (query.length < MIN_FAVORITE_SEARCH_LENGTH) return [];
    const limit = Math.min(
      MAX_FAVORITE_SEARCH_RESULTS,
      Math.max(1, Math.trunc(request.limit ?? 10)),
    );
    const { data, error } = await this.functions.invoke<CatalogResponse>("catalog-search", {
      body: { category: request.category, query, limit },
      signal: options.signal,
      timeout: 12_000,
    });
    if (error) {
      if (options.signal?.aborted) {
        throw options.signal.reason ?? new DOMException("A busca foi cancelada.", "AbortError");
      }
      throw new FavoriteCatalogUnavailableError();
    }
    const items = Array.isArray(data?.items) ? data.items : [];
    return items
      .filter(isFavoriteCatalogItem)
      .filter((item) => item.provider === favoriteProviderByCategory[request.category])
      .slice(0, limit);
  }
}

let defaultRepository: SupabaseFavoriteCatalogRepository | null = null;

export function getFavoriteCatalogRepository(): FavoriteCatalogRepository {
  defaultRepository ??= new SupabaseFavoriteCatalogRepository(getSupabaseClient().functions);
  return defaultRepository;
}
