import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseMessagingMediaRepository, validateMessageMedia } from "./supabase-messaging-media-repository";

describe("SupabaseMessagingMediaRepository", () => {
  it("uploads to a deterministic private path and returns a signed URL", async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: "https://signed.example/audio" }, error: null });
    const from = vi.fn(() => ({ upload, createSignedUrl }));
    const client = { storage: { from } } as unknown as SupabaseClient;
    const repository = new SupabaseMessagingMediaRepository(client, 60);
    const blob = new Blob(["audio"], { type: "audio/webm" });

    const result = await repository.upload({
      conversationId: "conversation-1",
      userId: "user-1",
      clientMessageId: "client-1",
      index: 0,
      media: { kind: "audio", blob, fileName: "minha gravação.webm", mimeType: "audio/webm", durationSeconds: 2 },
    });

    expect(from).toHaveBeenCalledWith("chat-media");
    expect(upload).toHaveBeenCalledWith(
      "user-1/conversation-1/client-1/0-minha-grava-o.webm",
      blob,
      expect.objectContaining({ contentType: "audio/webm", upsert: false }),
    );
    expect(createSignedUrl).toHaveBeenCalledWith(result.storagePath, 60);
    expect(result.signedUrl).toBe("https://signed.example/audio");
  });

  it("reuses the immutable deterministic object on an idempotent 409 retry", async () => {
    const upload = vi.fn().mockResolvedValue({ error: { statusCode: "409", message: "The resource already exists" } });
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: "https://signed.example/retry" }, error: null });
    const repository = new SupabaseMessagingMediaRepository({ storage: { from: vi.fn(() => ({ upload, createSignedUrl })) } } as unknown as SupabaseClient);

    await expect(repository.upload({
      conversationId: "conversation-1",
      userId: "user-1",
      clientMessageId: "client-1",
      index: 0,
      media: { kind: "audio", blob: new Blob(["audio"], { type: "audio/webm" }), fileName: "retry.webm", mimeType: "audio/webm" },
    })).resolves.toMatchObject({ storagePath: "user-1/conversation-1/client-1/0-retry.webm" });
  });

  it("rejects a MIME type outside the messaging allowlist", () => {
    expect(() => validateMessageMedia({
      kind: "image",
      blob: new Blob(["x"], { type: "text/html" }),
      fileName: "payload.html",
      mimeType: "text/html",
    })).toThrow("Formato de mídia não permitido");
  });

  it("rejects generic PDF uploads until a malware scanner is available", () => {
    const unsupported = {
      kind: "file",
      blob: new Blob(["pdf"], { type: "application/pdf" }),
      fileName: "documento.pdf",
      mimeType: "application/pdf",
    } as unknown as Parameters<typeof validateMessageMedia>[0];

    expect(() => validateMessageMedia(unsupported)).toThrow("Formato de");
  });

  it("accepts WAV PCM as private audio", () => {
    expect(() => validateMessageMedia({
      kind: "audio",
      blob: new Blob([new Uint8Array([82, 73, 70, 70])], { type: "audio/wav" }),
      fileName: "mensagem.wav",
      mimeType: "audio/wav",
    })).not.toThrow();
  });

  it("persists only WAV audio with a valid RIFF/WAVE signature", async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: "https://signed.example/audio" }, error: null });
    const client = { storage: { from: vi.fn(() => ({ upload, createSignedUrl })) } } as unknown as SupabaseClient;
    const repository = new SupabaseMessagingMediaRepository(client);
    const validHeader = new Uint8Array([82, 73, 70, 70, 4, 0, 0, 0, 87, 65, 86, 69]);

    await expect(repository.upload({
      conversationId: "conversation-1",
      userId: "user-1",
      clientMessageId: "client-1",
      index: 0,
      media: { kind: "audio", blob: new Blob([validHeader], { type: "audio/wav" }), fileName: "mensagem.wav", mimeType: "audio/wav" },
    })).resolves.toMatchObject({ mimeType: "audio/wav", fileName: "mensagem.wav" });

    await expect(repository.upload({
      conversationId: "conversation-1",
      userId: "user-1",
      clientMessageId: "client-2",
      index: 0,
      media: { kind: "audio", blob: new Blob(["not-wave"], { type: "audio/wav" }), fileName: "falso.wav", mimeType: "audio/wav" },
    })).rejects.toThrow("RIFF/WAVE");
    expect(upload).toHaveBeenCalledTimes(1);
  });
});
