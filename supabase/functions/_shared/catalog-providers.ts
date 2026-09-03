export const catalogCategories = [
  "movies",
  "series",
  "songs",
  "artists",
  "books",
  "games",
] as const;

export type CatalogCategory = (typeof catalogCategories)[number];
export type CatalogProvider = "apple" | "tvmaze" | "openlibrary" | "cheapshark";

export type CatalogItem = {
  label: string;
  externalId: string;
  provider: CatalogProvider;
  imageUrl?: string;
  subtitle?: string;
};

export function createCatalogEndpoint(
  category: CatalogCategory,
  query: string,
  limit: number,
): URL {
  if (category === "series") {
    const url = new URL("https://api.tvmaze.com/search/shows");
    url.searchParams.set("q", query);
    return url;
  }
  if (category === "books") {
    const url = new URL("https://openlibrary.org/search.json");
    url.searchParams.set("q", query);
    url.searchParams.set("fields", "key,title,author_name,first_publish_year,cover_i");
    url.searchParams.set("limit", String(limit));
    return url;
  }
  if (category === "games") {
    const url = new URL("https://www.cheapshark.com/api/1.0/games");
    url.searchParams.set("title", query);
    url.searchParams.set("limit", String(limit));
    return url;
  }
  const url = new URL("https://itunes.apple.com/search");
  url.searchParams.set("term", query);
  url.searchParams.set("country", "BR");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("media", category === "movies" ? "movie" : "music");
  url.searchParams.set(
    "entity",
    category === "movies" ? "movie" : category === "songs" ? "song" : "musicArtist",
  );
  return url;
}

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized || undefined;
}

function identifier(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return text(value);
}

function httpsUrl(value: unknown): string | undefined {
  const candidate = text(value);
  if (!candidate) return undefined;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function subtitle(parts: Array<string | undefined>): string | undefined {
  const distinct = [...new Set(parts.filter((part): part is string => Boolean(part)))];
  return distinct.length ? distinct.join(" · ") : undefined;
}

function yearFrom(value: unknown): string | undefined {
  const raw = text(value);
  const match = raw?.match(/^\d{4}/);
  return match?.[0];
}

export function mapAppleCatalogResponse(
  payload: unknown,
  category: "movies" | "songs" | "artists",
): CatalogItem[] {
  const root = record(payload);
  const results = Array.isArray(root?.results) ? root.results : [];
  return results.flatMap((value): CatalogItem[] => {
    const row = record(value);
    if (!row) return [];
    const isArtist = category === "artists";
    const id = identifier(isArtist ? row.artistId : row.trackId);
    const label = text(isArtist ? row.artistName : row.trackName);
    if (!id || !label) return [];
    const artist = isArtist ? undefined : text(row.artistName);
    const detail = isArtist
      ? text(row.primaryGenreName)
      : subtitle([artist, yearFrom(row.releaseDate)]);
    return [{
      label,
      externalId: `apple:${id}`,
      provider: "apple",
      imageUrl: httpsUrl(row.artworkUrl100),
      subtitle: detail,
    }];
  });
}

export function mapTvmazeCatalogResponse(payload: unknown): CatalogItem[] {
  const results = Array.isArray(payload) ? payload : [];
  return results.flatMap((value): CatalogItem[] => {
    const row = record(value);
    const show = record(row?.show);
    const id = identifier(show?.id);
    const label = text(show?.name);
    if (!id || !label) return [];
    const genres = Array.isArray(show?.genres)
      ? show.genres.map(text).filter((part): part is string => Boolean(part)).slice(0, 2).join(", ")
      : undefined;
    const image = record(show?.image);
    return [{
      label,
      externalId: `tvmaze:${id}`,
      provider: "tvmaze",
      imageUrl: httpsUrl(image?.medium ?? image?.original),
      subtitle: subtitle([yearFrom(show?.premiered), genres || undefined]),
    }];
  });
}

export function mapOpenLibraryCatalogResponse(payload: unknown): CatalogItem[] {
  const root = record(payload);
  const docs = Array.isArray(root?.docs) ? root.docs : [];
  return docs.flatMap((value): CatalogItem[] => {
    const row = record(value);
    const key = text(row?.key)?.replace(/^\/works\//, "");
    const label = text(row?.title);
    if (!key || !label) return [];
    const authors = Array.isArray(row?.author_name)
      ? row.author_name.map(text).filter((author): author is string => Boolean(author)).slice(0, 2).join(", ")
      : undefined;
    const coverId = identifier(row?.cover_i);
    return [{
      label,
      externalId: `openlibrary:${key}`,
      provider: "openlibrary",
      imageUrl: coverId
        ? `https://covers.openlibrary.org/b/id/${encodeURIComponent(coverId)}-M.jpg`
        : undefined,
      subtitle: subtitle([authors || undefined, identifier(row?.first_publish_year)]),
    }];
  });
}

export function mapCheapSharkCatalogResponse(payload: unknown): CatalogItem[] {
  const results = Array.isArray(payload) ? payload : [];
  return results.flatMap((value): CatalogItem[] => {
    const row = record(value);
    const id = identifier(row?.gameID);
    const label = text(row?.external);
    if (!id || !label) return [];
    return [{
      label,
      externalId: `cheapshark:${id}`,
      provider: "cheapshark",
      imageUrl: httpsUrl(row?.thumb),
    }];
  });
}

export function dedupeCatalogItems(items: readonly CatalogItem[], limit: number): CatalogItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.externalId)) return false;
    seen.add(item.externalId);
    return true;
  }).slice(0, limit);
}
