import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));
const appBase = process.env.GITHUB_ACTIONS ? "/social-orha/" : "/";

export default defineConfig({
  base: appBase,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "brand/orha-splash-primary.jpg",
        "brand/orha-splash-soft.jpg",
      ],
      manifest: {
        name: "ORHA",
        short_name: "ORHA",
        description:
          "Rede social cristã para criar vínculos, participar de comunidades e se expressar.",
        lang: "pt-BR",
        start_url: appBase,
        scope: appBase,
        display: "standalone",
        orientation: "portrait-primary",
        background_color: "#f7f7f4",
        theme_color: "#f7f7f4",
        categories: ["social", "lifestyle"],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,jpg,svg,woff2}"],
        navigateFallback: `${appBase}index.html`,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(rootDirectory, "src"),
    },
  },
});
