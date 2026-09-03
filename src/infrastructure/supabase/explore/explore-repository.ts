import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ExploreError,
  type ExploreInterest,
  type ExplorePage,
  type ExplorePageRequest,
  type ExplorePost,
  type ExploreRepository,
} from "@/domains/explore";
import type { ReactionKind } from "@/domains/social";
import type { Database } from "../database.types";
import { getSupabaseClient } from "../client";

type ExploreRow = Record<string, unknown>;
type SupabaseErrorLike = { code?: string; message?: string; status?: number };

const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 50;
const reactions = new Set<ReactionKind>(["like", "love", "amen", "pray", "support"]);

function mapError(error: unknown): ExploreError {
  if (error instanceof ExploreError) return error;
  const source = (error ?? {}) as SupabaseErrorLike;
  if (source.status === 401 || source.code === "PGRST301") {
    return new ExploreError("authentication", "Sua sessão expirou. Entre novamente.", { cause: error });
  }
  if (source.status === 403 || source.code === "42501") {
    return new ExploreError("permission", "Seu perfil não pode acessar a descoberta agora.", { cause: error });
  }
  if (source.status === 400 || source.code === "22023" || source.code === "23514") {
    return new ExploreError("validation", "A busca ou a página solicitada não é válida.", { cause: error });
  }
  if (source.status === 503 || source.status === 504 || source.code === "PGRST003") {
    return new ExploreError("unavailable", "A descoberta está temporariamente indisponível.", { cause: error });
  }
  if (error instanceof TypeError || /fetch|network|offline/i.test(source.message ?? "")) {
    return new ExploreError("network", "Sem conexão com o servidor. Verifique sua internet.", { cause: error });
  }
  return new ExploreError("unknown", "Não foi possível carregar a descoberta agora.", { cause: error });
}

function rowsOf(value: unknown): ExploreRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is ExploreRow => Boolean(item) && typeof item === "object",
  );
}

function normalizedLimit(limit?: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(limit ?? DEFAULT_PAGE_SIZE)));
}

function decodeCursor(cursor?: string | null): number {
  if (!cursor) return 0;
  if (!/^[0-9a-z]+$/i.test(cursor)) {
    throw new ExploreError("validation", "A página solicitada não é válida.");
  }
  const offset = Number.parseInt(cursor, 36);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10_000) {
    throw new ExploreError("validation", "A página solicitada não é válida.");
  }
  return offset;
}

function encodeCursor(offset: number): string {
  return offset.toString(36);
}

function pageFromRows<T>(rows: ExploreRow[], offset: number, limit: number, map: (row: ExploreRow) => T | null): ExplorePage<T> {
  const mapped = rows.slice(0, limit).map(map).filter((item): item is T => item !== null);
  const hasMore = rows.length > limit || (limit === MAX_PAGE_SIZE && rows.length === limit);
  return {
    items: mapped,
    nextCursor: hasMore ? encodeCursor(offset + limit) : null,
  };
}

function normalizeSearch(search?: string): string {
  return search?.trim().slice(0, 80) ?? "";
}

function finiteCount(value: unknown): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
  if (!Number.isSafeInteger(parsed) || parsed < 0) return 0;
  return parsed;
}

function mapInterest(row: ExploreRow): ExploreInterest | null {
  if (typeof row.interest !== "string") return null;
  const label = row.interest.trim();
  if (!label) return null;
  return {
    key: label.normalize("NFKC").toLocaleLowerCase("pt-BR"),
    label,
    profileCount: finiteCount(row.profile_count),
  };
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function mapPost(row: ExploreRow): ExplorePost | null {
  if (
    typeof row.post_id !== "string"
    || typeof row.author_id !== "string"
    || typeof row.author_name !== "string"
    || typeof row.author_username !== "string"
    || typeof row.body !== "string"
    || typeof row.created_at !== "string"
  ) {
    return null;
  }
  const viewerReaction = typeof row.viewer_reaction === "string"
    && reactions.has(row.viewer_reaction as ReactionKind)
    ? row.viewer_reaction as ReactionKind
    : null;
  return {
    id: row.post_id,
    authorId: row.author_id,
    authorName: row.author_name,
    authorUsername: row.author_username,
    authorAvatarPath: nullableString(row.author_avatar_path),
    communityId: nullableString(row.community_id),
    communityName: nullableString(row.community_name),
    communitySlug: nullableString(row.community_slug),
    body: row.body,
    createdAt: row.created_at,
    mediaCount: finiteCount(row.media_count),
    commentCount: finiteCount(row.comment_count),
    reactionCount: finiteCount(row.reaction_count),
    viewerReaction,
  };
}

function pageWindow(request: ExplorePageRequest) {
  const limit = normalizedLimit(request.limit);
  const offset = decodeCursor(request.cursor);
  return { limit, offset, rpcLimit: Math.min(limit + 1, MAX_PAGE_SIZE) };
}

export class SupabaseExploreRepository implements ExploreRepository {
  constructor(
    private readonly client: SupabaseClient<Database> = getSupabaseClient(),
  ) {}

  async listInterests(request: ExplorePageRequest = {}): Promise<ExplorePage<ExploreInterest>> {
    const { limit, offset, rpcLimit } = pageWindow(request);
    let query = this.client.rpc("search_discoverable_interests", {
      p_search: normalizeSearch(request.search),
      p_limit: rpcLimit,
      p_offset: offset,
    });
    if (request.signal) query = query.abortSignal(request.signal);
    const { data, error } = await query;
    if (error) throw mapError(error);
    return pageFromRows(rowsOf(data), offset, limit, mapInterest);
  }

  async listPublicPosts(request: ExplorePageRequest = {}): Promise<ExplorePage<ExplorePost>> {
    const { limit, offset, rpcLimit } = pageWindow(request);
    let query = this.client.rpc("search_discoverable_posts", {
      p_search: normalizeSearch(request.search),
      p_limit: rpcLimit,
      p_offset: offset,
    });
    if (request.signal) query = query.abortSignal(request.signal);
    const { data, error } = await query;
    if (error) throw mapError(error);
    return pageFromRows(rowsOf(data), offset, limit, mapPost);
  }
}

export function createSupabaseExploreRepository(
  client: SupabaseClient<Database> = getSupabaseClient(),
): ExploreRepository {
  return new SupabaseExploreRepository(client);
}
