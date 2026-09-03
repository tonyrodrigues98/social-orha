import { describe, expect, it } from "vitest";
import {
  addFavoriteItem,
  favoriteItemKey,
  MAX_FAVORITES_PER_CATEGORY,
  moveFavoriteItem,
  normalizeFavoriteSearchQuery,
  type FavoriteCatalogItem,
} from "./favorite-catalog";
import { favoriteItemsFromUnknown } from "./profile-data";

const movie = (id: number): FavoriteCatalogItem => ({
  label: `Filme ${id}`,
  externalId: `apple:${id}`,
  provider: "apple",
});

describe("favorite catalog model", () => {
  it("normalizes and bounds the search term", () => {
    expect(normalizeFavoriteSearchQuery("  the   chosen  ")).toBe("the chosen");
    expect(normalizeFavoriteSearchQuery("x".repeat(100))).toHaveLength(80);
  });

  it("deduplicates provider ids and enforces five selections", () => {
    const first = addFavoriteItem([], movie(1));
    expect(addFavoriteItem(first, { ...movie(1), label: "Outro título" })).toEqual(first);
    const full = Array.from({ length: MAX_FAVORITES_PER_CATEGORY }, (_, index) => movie(index));
    expect(addFavoriteItem(full, movie(99))).toEqual(full);
  });

  it("reorders without mutating the original collection", () => {
    const original = [movie(1), movie(2), movie(3)];
    const moved = moveFavoriteItem(original, 2, 0);
    expect(moved.map(favoriteItemKey)).toEqual(["apple:3", "apple:1", "apple:2"]);
    expect(original.map(favoriteItemKey)).toEqual(["apple:1", "apple:2", "apple:3"]);
  });

  it("reads the new provider payload and preserves legacy source rows", () => {
    expect(favoriteItemsFromUnknown([
      {
        label: "Interestelar",
        externalId: "apple:123",
        provider: "apple",
        subtitle: "Christopher Nolan · 2014",
        imageUrl: "https://example.com/poster.jpg",
      },
      { label: "Legado", source: "legacy-catalog" },
    ])).toEqual([
      {
        label: "Interestelar",
        externalId: "apple:123",
        provider: "apple",
        subtitle: "Christopher Nolan · 2014",
        source: undefined,
        imageUrl: "https://example.com/poster.jpg",
      },
      {
        label: "Legado",
        externalId: undefined,
        provider: "legacy-catalog",
        subtitle: undefined,
        source: "legacy-catalog",
        imageUrl: undefined,
      },
    ]);
  });
});
