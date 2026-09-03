import { describe, expect, it, vi } from "vitest";
import { processProfileImage, type ProfileImageProcessorEnvironment } from "./profile-image-processor";

describe("processProfileImage", () => {
  it("recorta, reduz e gera um arquivo WebP persistível", async () => {
    const release = vi.fn();
    const render = vi.fn(async () => new Blob([new Uint8Array(128)], { type: "image/webp" }));
    const environment: ProfileImageProcessorEnvironment = {
      decode: async () => ({
        source: {} as CanvasImageSource,
        width: 4000,
        height: 3000,
        release,
      }),
      render,
    };

    const result = await processProfileImage(
      new File([new Uint8Array(16)], "Minha Foto.JPG", { type: "image/jpeg" }),
      { purpose: "cover", crop: { x: 100, y: 100, width: 3200, height: 1800 } },
      environment,
    );

    expect(result).toMatchObject({ width: 1600, height: 900 });
    expect(result.file.name).toBe("Minha-Foto.webp");
    expect(result.file.type).toBe("image/webp");
    expect(render).toHaveBeenCalledWith(expect.objectContaining({
      crop: { x: 100, y: 100, width: 3200, height: 1800 },
      outputWidth: 1600,
      outputHeight: 900,
    }));
    expect(release).toHaveBeenCalledOnce();
  });

  it("preserva imagens menores sem ampliar", async () => {
    const environment: ProfileImageProcessorEnvironment = {
      decode: async () => ({ source: {} as CanvasImageSource, width: 800, height: 600 }),
      render: async () => new Blob([new Uint8Array(32)], { type: "image/webp" }),
    };
    const result = await processProfileImage(
      new File([new Uint8Array(4)], "foto.png", { type: "image/png" }),
      { purpose: "gallery" },
      environment,
    );
    expect(result).toMatchObject({ width: 800, height: 600 });
  });

  it("rejeita dimensões excessivas antes de renderizar", async () => {
    const release = vi.fn();
    const render = vi.fn();
    const environment: ProfileImageProcessorEnvironment = {
      decode: async () => ({
        source: {} as CanvasImageSource,
        width: 12_001,
        height: 800,
        release,
      }),
      render,
    };

    await expect(processProfileImage(
      new File([new Uint8Array(4)], "enorme.jpg", { type: "image/jpeg" }),
      { purpose: "gallery" },
      environment,
    )).rejects.toThrow("12.000 pixels");
    expect(render).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledOnce();
  });
});
