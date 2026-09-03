import { describe, expect, it } from "vitest";
import {
  createCatalogEndpoint,
  dedupeCatalogItems,
  mapAppleCatalogResponse,
  mapCheapSharkCatalogResponse,
  mapOpenLibraryCatalogResponse,
  mapTvmazeCatalogResponse,
} from "./catalog-providers";

describe("catalog provider normalization", () => {
  it("builds only the fixed provider endpoints for every category", () => {
    const endpoints = {
      movies: createCatalogEndpoint("movies", "the chosen", 7),
      series: createCatalogEndpoint("series", "the chosen", 7),
      songs: createCatalogEndpoint("songs", "the chosen", 7),
      artists: createCatalogEndpoint("artists", "the chosen", 7),
      books: createCatalogEndpoint("books", "the chosen", 7),
      games: createCatalogEndpoint("games", "the chosen", 7),
    };
    expect(endpoints.movies.origin).toBe("https://itunes.apple.com");
    expect(endpoints.movies.searchParams.get("entity")).toBe("movie");
    expect(endpoints.series.href).toBe("https://api.tvmaze.com/search/shows?q=the+chosen");
    expect(endpoints.songs.searchParams.get("entity")).toBe("song");
    expect(endpoints.artists.searchParams.get("entity")).toBe("musicArtist");
    expect(endpoints.books.origin).toBe("https://openlibrary.org");
    expect(endpoints.books.searchParams.get("limit")).toBe("7");
    expect(endpoints.games.origin).toBe("https://www.cheapshark.com");
    expect(endpoints.games.searchParams.get("title")).toBe("the chosen");
  });

  it("normalizes Apple movies, songs and artists", () => {
    expect(mapAppleCatalogResponse({ results: [{
      trackId: 1,
      trackName: "Interestelar",
      artistName: "Christopher Nolan",
      releaseDate: "2014-11-07T00:00:00Z",
      artworkUrl100: "https://example.com/movie.jpg",
    }] }, "movies")[0]).toEqual({
      label: "Interestelar",
      externalId: "apple:1",
      provider: "apple",
      imageUrl: "https://example.com/movie.jpg",
      subtitle: "Christopher Nolan · 2014",
    });
    expect(mapAppleCatalogResponse({ results: [{ artistId: 2, artistName: "Resgate", primaryGenreName: "Gospel" }] }, "artists")[0])
      .toMatchObject({ externalId: "apple:2", label: "Resgate", subtitle: "Gospel" });
  });

  it("normalizes TVmaze series with immutable artwork URLs", () => {
    expect(mapTvmazeCatalogResponse([{ show: {
      id: 7,
      name: "The Chosen",
      premiered: "2017-04-21",
      genres: ["Drama", "History"],
      image: { medium: "https://static.tvmaze.com/chosen.jpg" },
    } }])[0]).toEqual({
      label: "The Chosen",
      externalId: "tvmaze:7",
      provider: "tvmaze",
      imageUrl: "https://static.tvmaze.com/chosen.jpg",
      subtitle: "2017 · Drama, History",
    });
  });

  it("normalizes Open Library works and CheapShark games", () => {
    expect(mapOpenLibraryCatalogResponse({ docs: [{
      key: "/works/OL123W",
      title: "Cristianismo Puro e Simples",
      author_name: ["C. S. Lewis"],
      first_publish_year: 1952,
      cover_i: 42,
    }] })[0]).toEqual({
      label: "Cristianismo Puro e Simples",
      externalId: "openlibrary:OL123W",
      provider: "openlibrary",
      imageUrl: "https://covers.openlibrary.org/b/id/42-M.jpg",
      subtitle: "C. S. Lewis · 1952",
    });
    expect(mapCheapSharkCatalogResponse([{ gameID: "9", external: "Celeste", thumb: "https://example.com/celeste.jpg" }])[0])
      .toEqual({
        label: "Celeste",
        externalId: "cheapshark:9",
        provider: "cheapshark",
        imageUrl: "https://example.com/celeste.jpg",
      });
  });

  it("rejects unsafe images and deduplicates provider ids", () => {
    const items = mapCheapSharkCatalogResponse([
      { gameID: "1", external: "Jogo", thumb: "http://unsafe.example/jogo.jpg" },
      { gameID: "1", external: "Jogo duplicado" },
    ]);
    expect(items[0].imageUrl).toBeUndefined();
    expect(dedupeCatalogItems(items, 10)).toHaveLength(1);
  });
});
