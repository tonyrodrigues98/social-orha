import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PROFILE_MEDIA_BUCKET,
  PROFILE_MEDIA_SIGNED_URL_SECONDS,
  type ProfileMedia,
  type ReserveProfileMediaInput,
} from "@/domain/profile-media";
import { getSupabaseClient } from "./client";

export interface ProfileMediaRepository {
  listOwn(profileId: string): Promise<ProfileMedia[]>;
  reserve(input: ReserveProfileMediaInput): Promise<ProfileMedia>;
  finalize(mediaId: string): Promise<ProfileMedia>;
  remove(mediaId: string): Promise<void>;
  reorderGallery(mediaIds: readonly string[]): Promise<ProfileMedia[]>;
}

export interface ProfileBinaryStore {
  upload(media: ProfileMedia, file: File): Promise<void>;
  createReadUrl(media: Pick<ProfileMedia, "bucket_id" | "object_path">): Promise<string>;
}

function oneRow<T>(data: unknown, operation: string): T {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") {
    throw new Error(`O Supabase não retornou a mídia ao ${operation}.`);
  }
  return row as T;
}

export function createSupabaseProfileMediaRepository(
  client: SupabaseClient,
): ProfileMediaRepository {
  return {
    async listOwn(profileId) {
      const { data, error } = await client
        .from("profile_media")
        .select("*")
        .eq("profile_id", profileId)
        .eq("status", "ready")
        .order("purpose", { ascending: true })
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProfileMedia[];
    },

    async reserve(input) {
      const { data, error } = await client.rpc("reserve_profile_media", {
        p_purpose: input.purpose,
        p_mime_type: input.mimeType,
        p_byte_size: input.byteSize,
        p_width: input.width,
        p_height: input.height,
      });
      if (error) throw error;
      return oneRow<ProfileMedia>(data, "reservar");
    },

    async finalize(mediaId) {
      const { data, error } = await client.functions.invoke("media-verify", {
        body: { scope: "profile", mediaId },
      });
      if (error) throw error;
      const media = data && typeof data === "object" && "media" in data
        ? (data as { media: unknown }).media
        : null;
      return oneRow<ProfileMedia>(media, "finalizar");
    },

    async remove(mediaId) {
      const { error } = await client.rpc("remove_profile_media", {
        p_media_id: mediaId,
      });
      if (error) throw error;
    },

    async reorderGallery(mediaIds) {
      const { data, error } = await client.rpc("reorder_profile_gallery", {
        p_media_ids: [...mediaIds],
      });
      if (error) throw error;
      return (data ?? []) as ProfileMedia[];
    },
  };
}

export function createSupabaseProfileBinaryStore(client: SupabaseClient): ProfileBinaryStore {
  return {
    async upload(media, file) {
      if (media.bucket_id !== PROFILE_MEDIA_BUCKET) {
        throw new Error("O destino de mídia retornado pelo servidor não é permitido.");
      }
      const { error } = await client.storage
        .from(media.bucket_id)
        .upload(media.object_path, file, {
          contentType: file.type,
          cacheControl: "3600",
          upsert: false,
        });
      if (error) throw error;
    },

    async createReadUrl(media) {
      if (media.bucket_id !== PROFILE_MEDIA_BUCKET) {
        throw new Error("A mídia solicitada não pertence ao bucket privado do perfil.");
      }
      const { data, error } = await client.storage
        .from(media.bucket_id)
        .createSignedUrl(media.object_path, PROFILE_MEDIA_SIGNED_URL_SECONDS);
      if (error) throw error;
      if (!data?.signedUrl) throw new Error("Não foi possível autorizar a leitura da mídia.");
      return data.signedUrl;
    },
  };
}

export function getProfileMediaAdapters() {
  const client = getSupabaseClient();
  return {
    repository: createSupabaseProfileMediaRepository(client),
    storage: createSupabaseProfileBinaryStore(client),
  };
}
