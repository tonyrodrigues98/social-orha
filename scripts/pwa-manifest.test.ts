import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  APP_LAUNCH_COLOR,
  PWA_ASSET_PATHS,
  PWA_REGISTER_TYPE,
  createAppManifest,
} from "./pwa-manifest";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function readPngDimensions(assetPath: string) {
  const bytes = readFileSync(path.join(projectRoot, "public", assetPath));
  const pngSignature = "89504e470d0a1a0a";

  expect(bytes.subarray(0, 8).toString("hex")).toBe(pngSignature);

  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

describe("ORHA PWA manifest", () => {
  it("waits for an app restart before activating an update", () => {
    expect(PWA_REGISTER_TYPE).toBe("prompt");
  });

  it("keeps Pages scope, launch colors, and icon URLs consistent", () => {
    const manifest = createAppManifest("/social-orha/");

    expect(manifest.id).toBe("/social-orha/");
    expect(manifest.start_url).toBe("/social-orha/");
    expect(manifest.scope).toBe("/social-orha/");
    expect(manifest.background_color).toBe(APP_LAUNCH_COLOR);
    expect(manifest.theme_color).toBe(APP_LAUNCH_COLOR);
    expect(manifest.icons).toEqual([
      expect.objectContaining({
        src: "/social-orha/brand/orha-icon-192.png",
        sizes: "192x192",
        type: "image/png",
      }),
      expect.objectContaining({
        src: "/social-orha/brand/orha-icon-512.png",
        sizes: "512x512",
        type: "image/png",
      }),
    ]);
  });

  it("pre-caches every launch and install asset", () => {
    expect(PWA_ASSET_PATHS).toEqual(
      expect.arrayContaining([
        "brand/orha-icon-192.png",
        "brand/orha-icon-512.png",
        "brand/orha-apple-touch-icon.png",
      ]),
    );
  });

  it.each([
    ["brand/orha-icon-192.png", 192],
    ["brand/orha-icon-512.png", 512],
    ["brand/orha-apple-touch-icon.png", 180],
  ])("ships %s with the declared square dimensions", (assetPath, size) => {
    expect(readPngDimensions(assetPath)).toEqual({
      width: size,
      height: size,
    });
  });
});
