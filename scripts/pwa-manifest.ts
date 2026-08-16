export const APP_LAUNCH_COLOR = "#ffffff";
export const PWA_REGISTER_TYPE = "prompt" as const;

export const PWA_ASSET_PATHS = [
  "brand/orha-mark-transparent.png",
  "brand/orha-splash-primary.jpg",
  "brand/orha-splash-soft.jpg",
  "brand/orha-icon-192.png",
  "brand/orha-icon-512.png",
  "brand/orha-apple-touch-icon.png",
] as const;

export function createAppManifest(appBase: string) {
  return {
    id: appBase,
    name: "ORHA",
    short_name: "ORHA",
    description:
      "Rede social cristã para criar vínculos, participar de comunidades e se expressar.",
    lang: "pt-BR",
    start_url: appBase,
    scope: appBase,
    display: "standalone" as const,
    orientation: "portrait-primary" as const,
    background_color: APP_LAUNCH_COLOR,
    theme_color: APP_LAUNCH_COLOR,
    categories: ["social", "lifestyle"],
    icons: [
      {
        src: `${appBase}brand/orha-icon-192.png`,
        sizes: "192x192",
        type: "image/png",
        purpose: "any" as const,
      },
      {
        src: `${appBase}brand/orha-icon-512.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "any" as const,
      },
    ],
  };
}
