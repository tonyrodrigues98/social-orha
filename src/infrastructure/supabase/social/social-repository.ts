import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CreateCommentInput,
  CreateCommunityInput,
  CreatePostInput,
  CommunityListRequest,
  FriendshipListRequest,
  MembershipListRequest,
  PostListRequest,
  SetReactionInput,
  SocialPage,
  SocialPageRequest,
  SocialProfile,
  SocialReaction,
  SocialRepository,
} from "@/domains/social";
import {
  mapCommunity,
  mapCommunityMembership,
  mapCommunityPost,
  mapCommunityRule,
  mapFriendship,
  mapPostComment,
  mapSocialProfile,
  mapSocialReaction,
  type SocialRow,
} from "./mappers";
import {
  createSocialPage,
  decodeSocialCursor,
  normalizeSocialPageLimit,
} from "./pagination";

type SupabaseErrorLike = { message?: string } | null;

function socialRepositoryError(action: string, error: SupabaseErrorLike): Error {
  return new Error(`Não foi possível ${action}.`, { cause: error ?? undefined });
}

function rowsOf(value: unknown): SocialRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is SocialRow => Boolean(item) && typeof item === "object",
  );
}

function rowOf(value: unknown): SocialRow | null {
  if (Array.isArray(value)) return rowsOf(value)[0] ?? null;
  return value && typeof value === "object" ? (value as SocialRow) : null;
}

function relationCount(row: SocialRow, key: string): number {
  const relation = row[key];
  if (!Array.isArray(relation)) return 0;
  const count = relation[0];
  if (!count || typeof count !== "object") return 0;
  const value = (count as SocialRow).count;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizedSearch(search?: string): string {
  return search?.trim().slice(0, 80) ?? "";
}

export function toCommunitySlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
}

function ilikePattern(search?: string): string | null {
  const term = normalizedSearch(search);
  if (!term) return null;
  return `%${term.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
}

async function requireCurrentUserId(client: SupabaseClient): Promise<string> {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw socialRepositoryError("identificar sua conta", error);
  return data.user.id;
}

async function visibleProfile(
  client: SupabaseClient,
  profileId: string,
  signal?: AbortSignal,
): Promise<SocialProfile | null> {
  let request = client.rpc("get_visible_profiles", {
    target_profile_id: profileId,
    page_size: 1,
    page_offset: 0,
  });
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request;
  if (error) throw socialRepositoryError("carregar o perfil", error);
  const row = rowsOf(data)[0];
  return row ? mapSocialProfile(row) : null;
}

async function profilesById(
  client: SupabaseClient,
  profileIds: Array<string | null>,
  signal?: AbortSignal,
): Promise<Map<string, SocialProfile>> {
  const uniqueIds = [...new Set(profileIds.filter((id): id is string => Boolean(id)))];
  const profiles = await Promise.all(
    uniqueIds.map(async (id) => [id, await visibleProfile(client, id, signal)] as const),
  );
  return new Map(
    profiles.filter(
      (entry): entry is readonly [string, SocialProfile] => entry[1] !== null,
    ),
  );
}

function pageWindow(request?: SocialPageRequest) {
  const limit = normalizeSocialPageLimit(request?.limit);
  const offset = decodeSocialCursor(request?.cursor);
  return { limit, offset, end: offset + limit };
}

async function listVisibleProfiles(
  client: SupabaseClient,
  request: SocialPageRequest = {},
): Promise<SocialPage<SocialProfile>> {
  const { limit, offset } = pageWindow(request);
  let query = client.rpc("search_visible_profiles", {
    search_term: normalizedSearch(request.search),
    page_size: Math.min(limit + 1, 50),
    page_offset: offset,
  });
  if (request.signal) query = query.abortSignal(request.signal);
  const { data, error } = await query;
  if (error) throw socialRepositoryError("buscar pessoas", error);
  // The RPC caps page_size at 50, so a limit of 50 cannot fetch a sentinel
  // 51st row. A full page therefore continues once; an exact final page may
  // produce one harmless empty request, but it can never hide real profiles.
  return createSocialPage(
    rowsOf(data),
    offset,
    limit,
    mapSocialProfile,
    limit === 50,
  );
}

export function createSupabaseSocialRepository(
  client: SupabaseClient,
): SocialRepository {
  return {
    listProfiles: (request) => listVisibleProfiles(client, request),

    getProfile: (profileId, signal) => visibleProfile(client, profileId, signal),

    async listFriendships(request: FriendshipListRequest = {}) {
      const userId = await requireCurrentUserId(client);
      const { limit, offset, end } = pageWindow(request);
      let query = client
        .from("friendships")
        .select("*")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(offset, end);
      if (request.status) query = query.eq("status", request.status);
      if (request.direction === "incoming") query = query.eq("addressee_id", userId);
      if (request.direction === "outgoing") query = query.eq("requester_id", userId);
      if (request.signal) query = query.abortSignal(request.signal);
      const { data, error } = await query;
      if (error) throw socialRepositoryError("carregar amizades", error);

      const rows = rowsOf(data);
      const profiles = await profilesById(
        client,
        rows.flatMap((row) => [
          typeof row.requester_id === "string" ? row.requester_id : null,
          typeof row.addressee_id === "string" ? row.addressee_id : null,
        ]),
        request.signal,
      );
      return createSocialPage(rows, offset, limit, (row) =>
        mapFriendship({
          ...row,
          requester: profiles.get(String(row.requester_id)) ?? null,
          addressee: profiles.get(String(row.addressee_id)) ?? null,
        }),
      );
    },

    async getFriendshipWith(profileId, signal) {
      const userId = await requireCurrentUserId(client);
      let query = client
        .from("friendships")
        .select("*")
        .in("requester_id", [userId, profileId])
        .in("addressee_id", [userId, profileId]);
      if (signal) query = query.abortSignal(signal);
      const { data, error } = await query.maybeSingle();
      if (error) throw socialRepositoryError("carregar a amizade", error);
      const row = rowOf(data);
      if (!row) return null;

      const profiles = await profilesById(
        client,
        [
          typeof row.requester_id === "string" ? row.requester_id : null,
          typeof row.addressee_id === "string" ? row.addressee_id : null,
        ],
        signal,
      );
      return mapFriendship({
        ...row,
        requester: profiles.get(String(row.requester_id)) ?? null,
        addressee: profiles.get(String(row.addressee_id)) ?? null,
      });
    },

    async requestFriendship(profileId) {
      const { data, error } = await client.rpc("request_friendship", {
        target_user_id: profileId,
      });
      const row = rowOf(data);
      if (error || !row) throw socialRepositoryError("enviar a solicitação", error);
      return mapFriendship(row);
    },

    async respondToFriendship(friendshipId, accept) {
      const { data, error } = await client.rpc("respond_to_friendship", {
        friendship_id: friendshipId,
        accept_request: accept,
      });
      const row = rowOf(data);
      if (error || !row) throw socialRepositoryError("responder à solicitação", error);
      return mapFriendship(row);
    },

    async removeFriendship(friendshipId) {
      const { error } = await client.rpc("remove_friendship", {
        friendship_id: friendshipId,
      });
      if (error) throw socialRepositoryError("remover a amizade", error);
    },

    async listCommunities(request: CommunityListRequest = {}) {
      const userId = await requireCurrentUserId(client);
      const { limit, offset, end } = pageWindow(request);
      let query = client
        .from("communities")
        .select("*, community_memberships(count), community_posts(count)")
        .is("archived_at", null)
        .eq("community_memberships.status", "active")
        .eq("community_posts.status", "active")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(offset, end);
      const pattern = ilikePattern(request.search);
      if (pattern) query = query.ilike("name", pattern);
      if (request.category) {
        query = query.eq(
          "category",
          request.category.trim().toLocaleLowerCase("pt-BR"),
        );
      }
      if (request.signal) query = query.abortSignal(request.signal);
      const { data, error } = await query;
      if (error) throw socialRepositoryError("carregar comunidades", error);

      const rows = rowsOf(data);
      const communityIds = rows
        .map((row) => row.id)
        .filter((id): id is string => typeof id === "string");
      let memberships: SocialRow[] = [];
      if (communityIds.length) {
        let membershipQuery = client
          .from("community_memberships")
          .select("*")
          .eq("profile_id", userId)
          .in("community_id", communityIds);
        if (request.signal) membershipQuery = membershipQuery.abortSignal(request.signal);
        const membershipResult = await membershipQuery;
        if (membershipResult.error) {
          throw socialRepositoryError("carregar participações", membershipResult.error);
        }
        memberships = rowsOf(membershipResult.data);
      }
      const membershipByCommunity = new Map(
        memberships.map((membership) => [membership.community_id, membership]),
      );

      return createSocialPage(rows, offset, limit, (row) =>
        mapCommunity({
          ...row,
          member_count: relationCount(row, "community_memberships"),
          post_count: relationCount(row, "community_posts"),
          viewer_membership: membershipByCommunity.get(row.id) ?? null,
        }),
      );
    },

    async getCommunity(communityId, signal) {
      let query = client
        .from("communities")
        .select("*, community_memberships(count), community_posts(count)")
        .eq("id", communityId)
        .is("archived_at", null)
        .eq("community_memberships.status", "active")
        .eq("community_posts.status", "active");
      if (signal) query = query.abortSignal(signal);
      const { data, error } = await query.maybeSingle();
      if (error) throw socialRepositoryError("carregar a comunidade", error);
      let row = rowOf(data);
      if (!row) {
        let discoveryQuery = client.rpc("get_community_discovery", {
          p_community_id: communityId,
        });
        if (signal) discoveryQuery = discoveryQuery.abortSignal(signal);
        const discoveryResult = await discoveryQuery;
        if (discoveryResult.error) {
          throw socialRepositoryError(
            "carregar a comunidade",
            discoveryResult.error,
          );
        }
        const discovery = rowOf(discoveryResult.data);
        if (!discovery) return null;
        row = {
          id: discovery.community_id,
          owner_id: null,
          slug: discovery.slug,
          name: discovery.name,
          description: discovery.description,
          category: discovery.category,
          visibility: discovery.visibility,
          avatar_path: discovery.avatar_path,
          cover_path: discovery.cover_path,
          member_count: discovery.active_member_count,
          post_count: discovery.active_post_count,
          created_at: null,
          updated_at: null,
          archived_at: null,
        };
      }

      const userId = await requireCurrentUserId(client);
      let membershipQuery = client
        .from("community_memberships")
        .select("*")
        .eq("community_id", communityId)
        .eq("profile_id", userId);
      if (signal) membershipQuery = membershipQuery.abortSignal(signal);
      const membershipResult = await membershipQuery.maybeSingle();
      if (membershipResult.error) {
        throw socialRepositoryError("carregar a participação", membershipResult.error);
      }
      return mapCommunity({
        ...row,
        member_count:
          row.member_count ?? relationCount(row, "community_memberships"),
        post_count: row.post_count ?? relationCount(row, "community_posts"),
        viewer_membership: rowOf(membershipResult.data),
      });
    },

    async createCommunity(input: CreateCommunityInput) {
      const slug = toCommunitySlug(input.slug ?? input.name);
      if (slug.length < 3) {
        throw new Error("Use um nome com pelo menos três letras ou números.");
      }
      const { data, error } = await client.rpc("create_community", {
        p_name: input.name.trim(),
        p_slug: slug,
        p_description: input.description?.trim() ?? "",
        p_visibility: input.visibility ?? "public",
        p_category: input.category?.trim().toLocaleLowerCase("pt-BR") ?? "general",
      });
      const row = rowOf(data);
      if (error || !row) throw socialRepositoryError("criar a comunidade", error);
      return mapCommunity({
        ...row,
        member_count: 1,
        post_count: 0,
        viewer_membership: null,
      });
    },

    async listMemberships(request: MembershipListRequest = {}) {
      const { limit, offset, end } = pageWindow(request);
      let query = client
        .from("community_memberships")
        .select("*")
        .order("created_at", { ascending: false })
        .range(offset, end);
      if (request.communityId) query = query.eq("community_id", request.communityId);
      if (request.profileId) query = query.eq("profile_id", request.profileId);
      if (request.signal) query = query.abortSignal(request.signal);
      const { data, error } = await query;
      if (error) throw socialRepositoryError("carregar participações", error);
      const rows = rowsOf(data);
      const profiles = await profilesById(
        client,
        rows.map((row) =>
          typeof row.profile_id === "string" ? row.profile_id : null,
        ),
        request.signal,
      );
      return createSocialPage(rows, offset, limit, (row) =>
        mapCommunityMembership({
          ...row,
          profile:
            typeof row.profile_id === "string"
              ? (profiles.get(row.profile_id) ?? null)
              : null,
        }),
      );
    },

    async joinCommunity(communityId) {
      const { data, error } = await client.rpc("join_community", {
        p_community_id: communityId,
      });
      const row = rowOf(data);
      if (error || !row) throw socialRepositoryError("entrar na comunidade", error);
      return mapCommunityMembership(row);
    },

    async leaveCommunity(communityId) {
      const { error } = await client.rpc("leave_community", {
        p_community_id: communityId,
      });
      if (error) throw socialRepositoryError("sair da comunidade", error);
    },

    async respondToCommunityMembership(communityId, profileId, accept) {
      const { data, error } = await client.rpc(
        "respond_to_community_membership",
        {
          p_community_id: communityId,
          p_profile_id: profileId,
          p_accept: accept,
        },
      );
      const row = rowOf(data);
      if (error || !row) {
        throw socialRepositoryError("responder à solicitação de entrada", error);
      }
      return mapCommunityMembership(row);
    },

    async listCommunityRules(communityId, request: SocialPageRequest = {}) {
      const { limit, offset, end } = pageWindow(request);
      let query = client
        .from("community_rules")
        .select("*")
        .eq("community_id", communityId)
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, end);
      if (request.signal) query = query.abortSignal(request.signal);
      const { data, error } = await query;
      if (error) {
        throw socialRepositoryError("carregar as regras da comunidade", error);
      }
      return createSocialPage(rowsOf(data), offset, limit, mapCommunityRule);
    },

    async listPosts(request: PostListRequest = {}) {
      const userId = await requireCurrentUserId(client);
      const { limit, offset, end } = pageWindow(request);
      let query = client
        .from("community_posts")
        .select("*, post_comments(count), post_reactions(count)")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(offset, end);
      if (request.communityId) query = query.eq("community_id", request.communityId);
      if (request.authorId) query = query.eq("author_id", request.authorId);
      const pattern = ilikePattern(request.search);
      if (pattern) query = query.ilike("body", pattern);
      if (request.signal) query = query.abortSignal(request.signal);
      const { data, error } = await query;
      if (error) throw socialRepositoryError("carregar publicações", error);

      const rows = rowsOf(data);
      const postIds = rows
        .map((row) => row.id)
        .filter((id): id is string => typeof id === "string");
      let viewerReactions: SocialRow[] = [];
      if (postIds.length) {
        let reactionQuery = client
          .from("post_reactions")
          .select("post_id, kind")
          .eq("reactor_id", userId)
          .in("post_id", postIds);
        if (request.signal) reactionQuery = reactionQuery.abortSignal(request.signal);
        const reactionResult = await reactionQuery;
        if (reactionResult.error) {
          throw socialRepositoryError("carregar reações", reactionResult.error);
        }
        viewerReactions = rowsOf(reactionResult.data);
      }
      const reactionByPost = new Map(
        viewerReactions.map((reaction) => [reaction.post_id, reaction.kind]),
      );
      const authors = await profilesById(
        client,
        rows.map((row) => (typeof row.author_id === "string" ? row.author_id : null)),
        request.signal,
      );

      return createSocialPage(rows, offset, limit, (row) =>
        mapCommunityPost({
          ...row,
          comment_count: relationCount(row, "post_comments"),
          reaction_count: relationCount(row, "post_reactions"),
          viewer_reaction: reactionByPost.get(row.id) ?? null,
          author: authors.get(String(row.author_id)) ?? null,
        }),
      );
    },

    async getPost(communityId, postId, signal) {
      let request = client.rpc("get_visible_community_post", {
        p_post_id: postId,
      });
      if (signal) request = request.abortSignal(signal);
      const { data, error } = await request;
      if (error) throw socialRepositoryError("carregar a publicação", error);
      const row = rowOf(data);
      if (!row || row.community_id !== communityId) return null;

      const author = typeof row.author_id === "string"
        && typeof row.author_full_name === "string"
        && typeof row.author_username === "string"
        ? {
            id: row.author_id,
            full_name: row.author_full_name,
            username: row.author_username,
            avatar_path: row.author_avatar_path ?? null,
            bio: null,
            church: null,
            state_code: null,
            city: null,
            interests: [],
            hobbies: [],
            is_friend: false,
          }
        : null;

      return mapCommunityPost({
        id: row.post_id,
        community_id: row.community_id,
        author_id: row.author_id,
        body: row.body,
        visibility: row.visibility,
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
        comment_count: row.comment_count,
        reaction_count: row.reaction_count,
        viewer_reaction: row.viewer_reaction,
        author,
      });
    },

    async createPost(input: CreatePostInput) {
      const userId = await requireCurrentUserId(client);
      const { data, error } = await client
        .from("community_posts")
        .insert({
          author_id: userId,
          community_id: input.communityId ?? null,
          body: input.body.trim(),
          visibility: input.visibility ?? (input.communityId ? "community" : "public"),
        })
        .select("*")
        .single();
      const row = rowOf(data);
      if (error || !row) throw socialRepositoryError("publicar", error);
      return mapCommunityPost({
        ...row,
        comment_count: 0,
        reaction_count: 0,
        viewer_reaction: null,
      });
    },

    async listComments(postId, request: SocialPageRequest = {}) {
      const userId = await requireCurrentUserId(client);
      const { limit, offset, end } = pageWindow(request);
      let query = client
        .from("post_comments")
        .select("*, post_reactions(count)")
        .eq("post_id", postId)
        .eq("status", "active")
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, end);
      if (request.signal) query = query.abortSignal(request.signal);
      const { data, error } = await query;
      if (error) throw socialRepositoryError("carregar comentários", error);

      const rows = rowsOf(data);
      const commentIds = rows
        .map((row) => row.id)
        .filter((id): id is string => typeof id === "string");
      let viewerReactions: SocialRow[] = [];
      if (commentIds.length) {
        let reactionQuery = client
          .from("post_reactions")
          .select("comment_id, kind")
          .eq("reactor_id", userId)
          .in("comment_id", commentIds);
        if (request.signal) reactionQuery = reactionQuery.abortSignal(request.signal);
        const reactionResult = await reactionQuery;
        if (reactionResult.error) {
          throw socialRepositoryError("carregar reações", reactionResult.error);
        }
        viewerReactions = rowsOf(reactionResult.data);
      }
      const reactionByComment = new Map(
        viewerReactions.map((reaction) => [reaction.comment_id, reaction.kind]),
      );
      const authors = await profilesById(
        client,
        rows.map((row) => (typeof row.author_id === "string" ? row.author_id : null)),
        request.signal,
      );

      return createSocialPage(rows, offset, limit, (row) =>
        mapPostComment({
          ...row,
          reaction_count: relationCount(row, "post_reactions"),
          viewer_reaction: reactionByComment.get(row.id) ?? null,
          author: authors.get(String(row.author_id)) ?? null,
        }),
      );
    },

    async createComment(input: CreateCommentInput) {
      const userId = await requireCurrentUserId(client);
      const { data, error } = await client
        .from("post_comments")
        .insert({
          post_id: input.postId,
          author_id: userId,
          parent_comment_id: input.parentCommentId ?? null,
          body: input.body.trim(),
        })
        .select("*")
        .single();
      const row = rowOf(data);
      if (error || !row) throw socialRepositoryError("comentar", error);
      return mapPostComment({
        ...row,
        reaction_count: 0,
        viewer_reaction: null,
      });
    },

    async setReaction(input: SetReactionInput): Promise<SocialReaction | null> {
      const userId = await requireCurrentUserId(client);
      const targetColumn = input.targetType === "post" ? "post_id" : "comment_id";
      const { data: existingData, error: existingError } = await client
        .from("post_reactions")
        .select("*")
        .eq("reactor_id", userId)
        .eq(targetColumn, input.targetId)
        .maybeSingle();
      if (existingError) throw socialRepositoryError("carregar a reação", existingError);
      const existing = rowOf(existingData);

      if (!input.kind) {
        if (!existing) return null;
        const { error } = await client
          .from("post_reactions")
          .delete()
          .eq("id", existing.id);
        if (error) throw socialRepositoryError("remover a reação", error);
        return null;
      }

      const mutation = existing
        ? client
            .from("post_reactions")
            .update({ kind: input.kind })
            .eq("id", existing.id)
            .select("*")
            .single()
        : client
            .from("post_reactions")
            .insert({
              reactor_id: userId,
              post_id: input.targetType === "post" ? input.targetId : null,
              comment_id: input.targetType === "comment" ? input.targetId : null,
              kind: input.kind,
            })
            .select("*")
            .single();
      const { data, error } = await mutation;
      const row = rowOf(data);
      if (error || !row) throw socialRepositoryError("salvar a reação", error);
      return mapSocialReaction(row);
    },

  };
}
