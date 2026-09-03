import { describe, expect, it, vi } from "vitest";
import { SupabaseFavoriteCatalogRepository } from "./favorite-catalog-repository";

describe("SupabaseFavoriteCatalogRepository", () => {
  it("invokes the allowlisted Edge function and validates its response", async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: {
        items: [
          {
            label: "Interestelar",
            externalId: "apple:157336",
            provider: "apple",
            subtitle: "2014",
          },
          { label: "sem identificador", provider: "apple" },
        ],
      },
      error: null,
    });
    const repository = new SupabaseFavoriteCatalogRepository({ invoke });
    const controller = new AbortController();

    await expect(repository.search(
      { category: "movies", query: "  interestelar  ", limit: 40 },
      { signal: controller.signal },
    )).resolves.toEqual([
      {
        label: "Interestelar",
        externalId: "apple:157336",
        provider: "apple",
        subtitle: "2014",
      },
    ]);
    expect(invoke).toHaveBeenCalledWith("catalog-search", {
      body: { category: "movies", query: "interestelar", limit: 12 },
      signal: controller.signal,
      timeout: 12_000,
    });
  });

  it("does not call the network for incomplete terms", async () => {
    const invoke = vi.fn();
    const repository = new SupabaseFavoriteCatalogRepository({ invoke });
    await expect(repository.search({ category: "books", query: "a" })).resolves.toEqual([]);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("exposes a stable user-facing error instead of provider internals", async () => {
    const repository = new SupabaseFavoriteCatalogRepository({
      invoke: vi.fn().mockResolvedValue({ data: null, error: new Error("provider stack") }),
    });
    await expect(repository.search({ category: "games", query: "celeste" }))
      .rejects.toThrow("Não foi possível consultar o catálogo agora.");
  });
});
