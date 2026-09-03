import {
  assertPost,
  corsHeaders,
  errorResponse,
  jsonResponse,
  optionsResponse,
  parseJsonObject,
} from "../_shared/http.ts";
import { EdgeHttpError, requireAuthenticatedUser } from "../_shared/runtime.ts";
import {
  catalogCategories,
  createCatalogEndpoint,
  dedupeCatalogItems,
  mapAppleCatalogResponse,
  mapCheapSharkCatalogResponse,
  mapOpenLibraryCatalogResponse,
  mapTvmazeCatalogResponse,
  type CatalogCategory,
  type CatalogItem,
} from "../_shared/catalog-providers.ts";

const minimumQueryLength = 2;
const maximumQueryLength = 80;
const maximumResults = 12;
const requestTimeoutMs = 8_000;

function catalogCategory(value: unknown): CatalogCategory {
  if (typeof value === "string" && catalogCategories.includes(value as CatalogCategory)) {
    return value as CatalogCategory;
  }
  throw new EdgeHttpError(400, "invalid_category", "Escolha uma categoria de favoritos válida.");
}

function searchQuery(value: unknown): string {
  const normalized = typeof value === "string"
    ? value.trim().replace(/\s+/g, " ")
    : "";
  if (normalized.length < minimumQueryLength || normalized.length > maximumQueryLength) {
    throw new EdgeHttpError(
      400,
      "invalid_query",
      `A busca deve ter entre ${minimumQueryLength} e ${maximumQueryLength} caracteres.`,
    );
  }
  return normalized;
}

function resultLimit(value: unknown): number {
  if (value === undefined) return 10;
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > maximumResults) {
    throw new EdgeHttpError(400, "invalid_limit", `O limite deve estar entre 1 e ${maximumResults}.`);
  }
  return Number(value);
}

async function fetchProvider(category: CatalogCategory, query: string, limit: number): Promise<unknown> {
  const signal = AbortSignal.timeout(requestTimeoutMs);
  let response: Response;
  try {
    response = await fetch(createCatalogEndpoint(category, query, limit), {
      signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "ORHA-Catalog/1.0 (+https://tonyrodrigues98.github.io/social-orha/)",
      },
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "TimeoutError") {
      throw new EdgeHttpError(504, "catalog_timeout", "O catálogo demorou demais para responder.");
    }
    throw new EdgeHttpError(502, "catalog_unavailable", "O catálogo está temporariamente indisponível.");
  }
  if (response.status === 429) {
    throw new EdgeHttpError(503, "catalog_rate_limited", "O catálogo está ocupado. Tente novamente em instantes.");
  }
  if (!response.ok) {
    throw new EdgeHttpError(502, "catalog_unavailable", "O catálogo está temporariamente indisponível.");
  }
  try {
    return await response.json();
  } catch {
    throw new EdgeHttpError(502, "invalid_catalog_response", "O catálogo retornou uma resposta inválida.");
  }
}

function mapResponse(category: CatalogCategory, payload: unknown): CatalogItem[] {
  if (category === "series") return mapTvmazeCatalogResponse(payload);
  if (category === "books") return mapOpenLibraryCatalogResponse(payload);
  if (category === "games") return mapCheapSharkCatalogResponse(payload);
  return mapAppleCatalogResponse(payload, category);
}

async function handleRequest(request: Request): Promise<Response> {
  try {
    if (request.method === "OPTIONS") return optionsResponse(request);
    // Validate browser origins before authentication or any provider egress.
    corsHeaders(request);
    assertPost(request);
    await requireAuthenticatedUser(request);
    const body = await parseJsonObject(request, 2_048);
    const category = catalogCategory(body.category);
    const query = searchQuery(body.query);
    const limit = resultLimit(body.limit);
    const payload = await fetchProvider(category, query, limit);
    return jsonResponse(request, {
      items: dedupeCatalogItems(mapResponse(category, payload), limit),
    });
  } catch (cause) {
    return errorResponse(request, cause);
  }
}

type EdgeRuntime = {
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const edgeRuntime = (globalThis as { Deno?: EdgeRuntime }).Deno;
if (!edgeRuntime) throw new Error("edge_runtime_unavailable");
edgeRuntime.serve(handleRequest);
