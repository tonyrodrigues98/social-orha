import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProfileMedia } from "@/domain/profile-media";
import {
  createSupabaseProfileBinaryStore,
  createSupabaseProfileMediaRepository,
} from "./profile-media-repository";

const reservation: ProfileMedia = {
  id: "media-1",
  profile_id: "user-1",
  purpose: "cover",
  bucket_id: "profile-media",
  object_path: "user-1/cover/media-1.webp",
  mime_type: "image/webp",
  byte_size: 128,
  width: 1600,
  height: 900,
  sort_order: 0,
  status: "pending",
  created_at: "2026-08-16T00:00:00Z",
  updated_at: "2026-08-16T00:00:00Z",
};

describe("profile media Supabase adapters", () => {
  it("reserva mídia somente pela RPC autenticada", async () => {
    const rpc = vi.fn(async () => ({ data: reservation, error: null }));
    const repository = createSupabaseProfileMediaRepository({ rpc } as unknown as SupabaseClient);

    await expect(repository.reserve({
      purpose: "cover",
      mimeType: "image/webp",
      byteSize: 128,
      width: 1600,
      height: 900,
    })).resolves.toEqual(reservation);
    expect(rpc).toHaveBeenCalledWith("reserve_profile_media", {
      p_purpose: "cover",
      p_mime_type: "image/webp",
      p_byte_size: 128,
      p_width: 1600,
      p_height: 900,
    });
  });

  it("promove a mídia somente depois da verificação server-side", async () => {
    const invoke = vi.fn(async () => ({
      data: { media: { ...reservation, status: "ready" } },
      error: null,
    }));
    const repository = createSupabaseProfileMediaRepository({
      functions: { invoke },
    } as unknown as SupabaseClient);

    await expect(repository.finalize(reservation.id)).resolves.toMatchObject({ status: "ready" });
    expect(invoke).toHaveBeenCalledWith("media-verify", {
      body: { scope: "profile", mediaId: reservation.id },
    });
  });

  it("envia o binário ao bucket privado e gera URL assinada", async () => {
    const upload = vi.fn(async () => ({ error: null }));
    const createSignedUrl = vi.fn(async () => ({
      data: { signedUrl: "https://signed.example/media" },
      error: null,
    }));
    const bucket = { upload, createSignedUrl };
    const from = vi.fn(() => bucket);
    const storage = createSupabaseProfileBinaryStore({
      storage: { from },
    } as unknown as SupabaseClient);
    const file = new File([new Uint8Array(128)], "cover.webp", { type: "image/webp" });

    await storage.upload(reservation, file);
    await expect(storage.createReadUrl(reservation)).resolves.toBe("https://signed.example/media");
    expect(from).toHaveBeenCalledWith("profile-media");
    expect(upload).toHaveBeenCalledWith(reservation.object_path, file, {
      contentType: "image/webp",
      cacheControl: "3600",
      upsert: false,
    });
  });

  it("agenda a remoção no banco para o worker privilegiado", async () => {
    const rpc = vi.fn(async () => ({ data: { ...reservation, status: "deleting" }, error: null }));
    const repository = createSupabaseProfileMediaRepository({ rpc } as unknown as SupabaseClient);

    await expect(repository.remove(reservation.id)).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith("remove_profile_media", {
      p_media_id: reservation.id,
    });
  });
});
