import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CommunityAssetKind,
  CommunityAssetUrls,
  CommunityMediaDimensions,
  CommunityPostMedia,
  CommunityRuleDraft,
  CommunityUpdate,
} from "@/domain/community-management";
import {
  COMMUNITY_MEDIA_BUCKET,
  COMMUNITY_MEDIA_SIGNED_URL_SECONDS,
  extensionForCommunityMedia,
  validateCommunityMediaFile,
  validateCommunityRule,
  validateCommunityUpdate,
} from "@/domain/community-management";
import type { CommunityRole, CommunityRule } from "@/domains/social";
import { getSupabaseClient } from "./client";

type DataRow = Record<string, unknown>;

export interface CommunityManagementRepository {
  updateCommunity(communityId: string, input: CommunityUpdate): Promise<void>;
  archiveCommunity(communityId: string): Promise<void>;
  createRule(communityId: string, input: CommunityRuleDraft): Promise<CommunityRule>;
  updateRule(ruleId: string, input: CommunityRuleDraft): Promise<CommunityRule>;
  deleteRule(ruleId: string): Promise<void>;
  resolveCommunityAssets(input: {
    avatarPath: string | null;
    coverPath: string | null;
  }): Promise<CommunityAssetUrls>;
  uploadCommunityAsset(input: {
    communityId: string;
    kind: CommunityAssetKind;
    file: File;
    dimensions: CommunityMediaDimensions;
    previousPath: string | null;
  }): Promise<{ objectPath: string; readUrl: string }>;
  listPostMedia(postIds: readonly string[], signal?: AbortSignal): Promise<CommunityPostMedia[]>;
  uploadPostMedia(input: {
    postId: string;
    file: File;
    dimensions: CommunityMediaDimensions;
    sortOrder: number;
  }): Promise<CommunityPostMedia>;
  removePostMedia(media: CommunityPostMedia): Promise<void>;
  removePost(postId: string): Promise<void>;
  removeComment(commentId: string): Promise<void>;
  setMemberRole(communityId: string, profileId: string, role: Exclude<CommunityRole, "owner">): Promise<void>;
  banMember(communityId: string, profileId: string, reason: string): Promise<void>;
  unbanMember(communityId: string, profileId: string): Promise<void>;
}

function rowOf(data: unknown): DataRow | null {
  const row = Array.isArray(data) ? data[0] : data;
  return row && typeof row === "object" ? row as DataRow : null;
}

function rowsOf(data: unknown): DataRow[] {
  return Array.isArray(data)
    ? data.filter((row): row is DataRow => Boolean(row) && typeof row === "object")
    : [];
}

function operationError(operation: string, error?: unknown): Error {
  const message = error && typeof error === "object" && "message" in error
    ? String(error.message)
    : null;
  return new Error(message?.trim() || `Não foi possível ${operation}.`);
}

async function requireUserId(client: SupabaseClient): Promise<string> {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw operationError("confirmar sua sessão", error);
  return data.user.id;
}

function mapRule(row: DataRow): CommunityRule {
  return {
    id: String(row.id),
    communityId: String(row.community_id),
    title: String(row.title),
    description: String(row.description),
    sortOrder: Number(row.sort_order),
    createdBy: typeof row.created_by === "string" ? row.created_by : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapPostMedia(row: DataRow, readUrl: string | null): CommunityPostMedia {
  if (row.bucket_id !== COMMUNITY_MEDIA_BUCKET) {
    throw new Error("A mídia retornada não pertence ao bucket comunitário.");
  }
  return {
    id: String(row.id),
    postId: String(row.post_id),
    ownerId: String(row.owner_id),
    bucketId: COMMUNITY_MEDIA_BUCKET,
    objectPath: String(row.object_path),
    mimeType: String(row.mime_type),
    byteSize: Number(row.byte_size),
    width: typeof row.width === "number" ? row.width : null,
    height: typeof row.height === "number" ? row.height : null,
    sortOrder: Number(row.sort_order),
    createdAt: String(row.created_at),
    readUrl,
  };
}

async function signedUrl(
  client: SupabaseClient,
  objectPath: string | null,
): Promise<string | null> {
  if (!objectPath) return null;
  const { data, error } = await client.storage
    .from(COMMUNITY_MEDIA_BUCKET)
    .createSignedUrl(objectPath, COMMUNITY_MEDIA_SIGNED_URL_SECONDS);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

async function bestEffortRejectPostMedia(client: SupabaseClient, mediaId: string): Promise<void> {
  try {
    await client.rpc("remove_post_media", { p_media_id: mediaId });
  } catch {
    // The pending reservation remains non-readable and is covered by the
    // server-side stale-reservation cleanup if the network is unavailable.
  }
}

function communityAssetObjectPath(
  ownerId: string,
  communityId: string,
  kind: CommunityAssetKind,
  file: File,
): string {
  const extension = extensionForCommunityMedia(file.type);
  return `${ownerId}/community/${communityId}/${kind}/${crypto.randomUUID()}.${extension}`;
}

function postMediaObjectPath(ownerId: string, postId: string, file: File): string {
  const extension = extensionForCommunityMedia(file.type);
  return `${ownerId}/post/${postId}/${crypto.randomUUID()}.${extension}`;
}

export function createSupabaseCommunityManagementRepository(
  client: SupabaseClient,
): CommunityManagementRepository {
  return {
    async updateCommunity(communityId, input) {
      const values = validateCommunityUpdate(input);
      const { error } = await client
        .from("communities")
        .update({
          name: values.name,
          description: values.description,
          category: values.category,
          visibility: values.visibility,
        })
        .eq("id", communityId);
      if (error) throw operationError("salvar a comunidade", error);
    },

    async archiveCommunity(communityId) {
      const { error } = await client.rpc("archive_community", {
        p_community_id: communityId,
      });
      if (error) throw operationError("arquivar a comunidade", error);
    },

    async createRule(communityId, input) {
      const userId = await requireUserId(client);
      const values = validateCommunityRule(input);
      const { data, error } = await client
        .from("community_rules")
        .insert({
          community_id: communityId,
          created_by: userId,
          title: values.title,
          description: values.description,
          sort_order: values.sortOrder,
        })
        .select("*")
        .single();
      const row = rowOf(data);
      if (error || !row) throw operationError("criar a regra", error);
      return mapRule(row);
    },

    async updateRule(ruleId, input) {
      const values = validateCommunityRule(input);
      const { data, error } = await client
        .from("community_rules")
        .update({
          title: values.title,
          description: values.description,
          sort_order: values.sortOrder,
        })
        .eq("id", ruleId)
        .select("*")
        .single();
      const row = rowOf(data);
      if (error || !row) throw operationError("editar a regra", error);
      return mapRule(row);
    },

    async deleteRule(ruleId) {
      const { error } = await client.from("community_rules").delete().eq("id", ruleId);
      if (error) throw operationError("remover a regra", error);
    },

    async resolveCommunityAssets(input) {
      const [avatarUrl, coverUrl] = await Promise.all([
        signedUrl(client, input.avatarPath),
        signedUrl(client, input.coverPath),
      ]);
      return { avatarUrl, coverUrl };
    },

    async uploadCommunityAsset(input) {
      validateCommunityMediaFile(input.file, input.kind);
      const userId = await requireUserId(client);
      const objectPath = communityAssetObjectPath(
        userId,
        input.communityId,
        input.kind,
        input.file,
      );
      const reservationResult = await client.rpc("reserve_community_branding_media", {
        p_community_id: input.communityId,
        p_purpose: input.kind,
        p_object_path: objectPath,
        p_mime_type: input.file.type,
        p_byte_size: input.file.size,
        p_width: input.dimensions.width,
        p_height: input.dimensions.height,
      });
      const reservation = rowOf(reservationResult.data);
      if (reservationResult.error || !reservation) {
        throw operationError("reservar a imagem", reservationResult.error);
      }
      if (
        reservation.owner_id !== userId
        || reservation.community_id !== input.communityId
        || reservation.purpose !== input.kind
        || reservation.bucket_id !== COMMUNITY_MEDIA_BUCKET
        || reservation.object_path !== objectPath
      ) {
        throw new Error("O servidor retornou uma reserva de imagem incompatível.");
      }
      const bucket = client.storage.from(COMMUNITY_MEDIA_BUCKET);
      const upload = await bucket.upload(objectPath, input.file, {
        cacheControl: "3600",
        contentType: input.file.type,
        upsert: false,
      });
      if (upload.error) throw operationError("enviar a imagem", upload.error);

      const verified = await client.functions.invoke("media-verify", {
        body: { scope: "community_branding", mediaId: String(reservation.id) },
      });
      if (verified.error) throw operationError("validar a imagem enviada", verified.error);
      const readUrl = await signedUrl(client, objectPath);
      if (!readUrl) throw new Error("A imagem foi salva, mas ainda não pôde ser carregada.");
      return { objectPath, readUrl };
    },

    async listPostMedia(postIds, signal) {
      if (!postIds.length) return [];
      let query = client
        .from("post_media")
        .select("*")
        .in("post_id", [...postIds])
        .eq("status", "ready")
        .order("sort_order", { ascending: true });
      if (signal) query = query.abortSignal(signal);
      const { data, error } = await query;
      if (error) throw operationError("carregar as mídias das publicações", error);
      return Promise.all(rowsOf(data).map(async (row) =>
        mapPostMedia(row, await signedUrl(client, String(row.object_path))),
      ));
    },

    async uploadPostMedia(input) {
      validateCommunityMediaFile(input.file, "post");
      if (!Number.isInteger(input.sortOrder) || input.sortOrder < 0 || input.sortOrder > 5) {
        throw new Error("A posição da mídia é inválida.");
      }
      const userId = await requireUserId(client);
      const objectPath = postMediaObjectPath(userId, input.postId, input.file);
      const reservationResult = await client.rpc("reserve_post_media", {
        p_post_id: input.postId,
        p_object_path: objectPath,
        p_mime_type: input.file.type,
        p_byte_size: input.file.size,
        p_width: input.dimensions.width,
        p_height: input.dimensions.height,
        p_sort_order: input.sortOrder,
      });
      const reservation = rowOf(reservationResult.data);
      if (reservationResult.error || !reservation) {
        throw operationError("reservar a mídia", reservationResult.error);
      }
      if (
        reservation.owner_id !== userId
        || reservation.bucket_id !== COMMUNITY_MEDIA_BUCKET
        || reservation.object_path !== objectPath
        || reservation.post_id !== input.postId
      ) {
        throw new Error("O servidor retornou uma reserva de mídia incompatível.");
      }
      const mediaId = String(reservation.id);
      const bucket = client.storage.from(COMMUNITY_MEDIA_BUCKET);
      const upload = await bucket.upload(objectPath, input.file, {
        cacheControl: "3600",
        contentType: input.file.type,
        upsert: false,
      });
      if (upload.error) {
        await bestEffortRejectPostMedia(client, mediaId);
        throw operationError("enviar a mídia", upload.error);
      }

      const verified = await client.functions.invoke("media-verify", {
        body: { scope: "post", mediaId },
      });
      if (verified.error) {
        await bestEffortRejectPostMedia(client, mediaId);
        throw operationError("validar a mídia enviada", verified.error);
      }

      const { data, error } = await client
        .from("post_media")
        .select("*")
        .eq("id", mediaId)
        .eq("status", "ready")
        .single();
      const finalized = rowOf(data);
      if (error || !finalized) {
        throw operationError("confirmar a mídia validada", error);
      }
      return mapPostMedia(finalized, await signedUrl(client, objectPath));
    },

    async removePostMedia(media) {
      const { error } = await client.rpc("remove_post_media", {
        p_media_id: media.id,
      });
      if (error) throw operationError("remover a mídia", error);
    },

    async removePost(postId) {
      const { error } = await client.rpc("remove_community_post", { p_post_id: postId });
      if (error) throw operationError("excluir a publicação", error);
    },

    async removeComment(commentId) {
      const { error } = await client.rpc("remove_post_comment", { p_comment_id: commentId });
      if (error) throw operationError("excluir o comentário", error);
    },

    async setMemberRole(communityId, profileId, role) {
      const { error } = await client.rpc("set_community_member_role", {
        p_community_id: communityId,
        p_profile_id: profileId,
        p_role: role,
      });
      if (error) throw operationError("atualizar a função do membro", error);
    },

    async banMember(communityId, profileId, reason) {
      const normalizedReason = reason.trim();
      if (normalizedReason.length < 3 || normalizedReason.length > 1_000) {
        throw new Error("Informe um motivo entre 3 e 1.000 caracteres.");
      }
      const { error } = await client.rpc("ban_community_member", {
        p_community_id: communityId,
        p_profile_id: profileId,
        p_reason: normalizedReason,
      });
      if (error) throw operationError("remover o membro da comunidade", error);
    },

    async unbanMember(communityId, profileId) {
      const { error } = await client.rpc("unban_community_member", {
        p_community_id: communityId,
        p_profile_id: profileId,
      });
      if (error) throw operationError("liberar o membro", error);
    },
  };
}

let defaultRepository: CommunityManagementRepository | null = null;

export function getCommunityManagementRepository(): CommunityManagementRepository {
  defaultRepository ??= createSupabaseCommunityManagementRepository(getSupabaseClient());
  return defaultRepository;
}
