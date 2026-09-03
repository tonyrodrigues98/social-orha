import { describe, expect, it, vi } from "vitest";
import type { ProfileMedia } from "@/domain/profile-media";
import type {
  ProfileBinaryStore,
  ProfileMediaRepository,
} from "@/infrastructure/supabase/profile-media-repository";
import { ProfileMediaService } from "./profile-media-service";

const reservation: ProfileMedia = {
  id: "media-1",
  profile_id: "user-1",
  purpose: "gallery",
  bucket_id: "profile-media",
  object_path: "user-1/gallery/media-1.webp",
  mime_type: "image/webp",
  byte_size: 64,
  width: 800,
  height: 600,
  sort_order: 1,
  status: "pending",
  created_at: "2026-08-16T00:00:00Z",
  updated_at: "2026-08-16T00:00:00Z",
};

function dependencies() {
  const repository: ProfileMediaRepository = {
    listOwn: vi.fn(async () => []),
    reserve: vi.fn(async () => reservation),
    finalize: vi.fn(async () => ({ ...reservation, status: "ready" as const })),
    remove: vi.fn(async () => undefined),
    reorderGallery: vi.fn(async () => []),
  };
  const storage: ProfileBinaryStore = {
    upload: vi.fn(async () => undefined),
    createReadUrl: vi.fn(async () => "https://signed.example/media"),
  };
  return { repository, storage };
}

describe("ProfileMediaService", () => {
  it("reserva, envia e finaliza sem transformar uma falha de assinatura em falha de upload", async () => {
    const { repository, storage } = dependencies();
    vi.mocked(storage.createReadUrl).mockRejectedValueOnce(new Error("signing unavailable"));
    const service = new ProfileMediaService(repository, storage);
    const file = new File([new Uint8Array(64)], "foto.webp", { type: "image/webp" });

    await expect(service.upload("gallery", { file, width: 800, height: 600 })).resolves.toMatchObject({
      id: "media-1",
      status: "ready",
    });
    expect(storage.createReadUrl).not.toHaveBeenCalled();
    expect(vi.mocked(repository.reserve).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(storage.upload).mock.invocationCallOrder[0]);
    expect(vi.mocked(storage.upload).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(repository.finalize).mock.invocationCallOrder[0]);
  });

  it("agenda cleanup server-side quando a verificação final falha", async () => {
    const { repository, storage } = dependencies();
    vi.mocked(repository.finalize).mockRejectedValueOnce(new Error("finalize failed"));
    const service = new ProfileMediaService(repository, storage);
    const file = new File([new Uint8Array(64)], "foto.webp", { type: "image/webp" });

    await expect(service.upload("gallery", { file, width: 800, height: 600 })).rejects.toThrow("finalize failed");
    expect(repository.remove).toHaveBeenCalledWith("media-1");
    expect(vi.mocked(repository.finalize).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(repository.remove).mock.invocationCallOrder[0]);
  });

  it("preserva a falha original quando o agendamento do cleanup também falha", async () => {
    const { repository, storage } = dependencies();
    vi.mocked(repository.finalize).mockRejectedValueOnce(new Error("finalize failed"));
    vi.mocked(repository.remove).mockRejectedValueOnce(new Error("cleanup unavailable"));
    const service = new ProfileMediaService(repository, storage);
    const file = new File([new Uint8Array(64)], "foto.webp", { type: "image/webp" });

    await expect(service.upload("gallery", { file, width: 800, height: 600 })).rejects.toThrow("finalize failed");
    expect(repository.remove).toHaveBeenCalledWith("media-1");
  });

  it("preserva itens válidos quando apenas uma URL assinada falha", async () => {
    const { repository, storage } = dependencies();
    vi.mocked(repository.listOwn).mockResolvedValueOnce([
      reservation,
      { ...reservation, id: "media-2", object_path: "user-1/gallery/media-2.webp" },
    ]);
    vi.mocked(storage.createReadUrl)
      .mockResolvedValueOnce("https://signed.example/media-1")
      .mockRejectedValueOnce(new Error("signing unavailable"));
    const service = new ProfileMediaService(repository, storage);

    await expect(service.listOwn("user-1")).resolves.toEqual([
      { ...reservation, readUrl: "https://signed.example/media-1" },
      {
        ...reservation,
        id: "media-2",
        object_path: "user-1/gallery/media-2.webp",
        readUrl: null,
      },
    ]);
  });

  it("marca a mídia para o cleanup privilegiado sem excluir Storage no navegador", async () => {
    const { repository, storage } = dependencies();
    const service = new ProfileMediaService(repository, storage);

    await service.remove(reservation);

    expect(repository.remove).toHaveBeenCalledWith("media-1");
    expect(storage.upload).not.toHaveBeenCalled();
    expect(storage.createReadUrl).not.toHaveBeenCalled();
  });
});
