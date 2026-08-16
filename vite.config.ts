import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import {
  PWA_ASSET_PATHS,
  PWA_REGISTER_TYPE,
  createAppManifest,
} from "./scripts/pwa-manifest";

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));
const appBase = process.env.GITHUB_ACTIONS ? "/social-orha/" : "/";

export default defineConfig({
  base: appBase,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: PWA_REGISTER_TYPE,
      includeAssets: [...PWA_ASSET_PATHS],
      manifest: createAppManifest(appBase),
      workbox: {
        globPatterns: ["**/*.{js,css,html,jpg,png,svg,woff2}"],
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
