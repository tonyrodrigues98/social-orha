import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type HtmlTagDescriptor, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import {
  PWA_ASSET_PATHS,
  PWA_REGISTER_TYPE,
  createAppManifest,
} from "./scripts/pwa-manifest";
import {
  createSiteMetadata,
  normalizeAppBase,
  resolvePublicOrigin,
} from "./scripts/site-config";

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));

function createMetadataPlugin(metadata: ReturnType<typeof createSiteMetadata>): Plugin {
  const tags: HtmlTagDescriptor[] = [
    { tag: "meta", attrs: { name: "description", content: metadata.description }, injectTo: "head" },
    { tag: "meta", attrs: { property: "og:type", content: "website" }, injectTo: "head" },
    { tag: "meta", attrs: { property: "og:locale", content: "pt_BR" }, injectTo: "head" },
    { tag: "meta", attrs: { property: "og:title", content: metadata.title }, injectTo: "head" },
    { tag: "meta", attrs: { property: "og:description", content: metadata.description }, injectTo: "head" },
    { tag: "meta", attrs: { name: "twitter:card", content: "summary" }, injectTo: "head" },
  ];
  if (metadata.canonicalUrl) {
    tags.push(
      { tag: "link", attrs: { rel: "canonical", href: metadata.canonicalUrl }, injectTo: "head" },
      { tag: "meta", attrs: { property: "og:url", content: metadata.canonicalUrl }, injectTo: "head" },
    );
  }
  if (metadata.socialImageUrl) {
    tags.push(
      { tag: "meta", attrs: { property: "og:image", content: metadata.socialImageUrl }, injectTo: "head" },
      { tag: "meta", attrs: { property: "og:image:width", content: "512" }, injectTo: "head" },
      { tag: "meta", attrs: { property: "og:image:height", content: "512" }, injectTo: "head" },
    );
  }
  return {
    name: "orha-environment-site-metadata",
    transformIndexHtml: () => tags,
  };
}

export default defineConfig(({ mode }) => {
  const environment = { ...loadEnv(mode, rootDirectory, ""), ...process.env };
  const appBase = normalizeAppBase(environment.VITE_ORHA_BASE_PATH);
  const metadata = createSiteMetadata({
    appBase,
    publicOrigin: resolvePublicOrigin(environment) ?? undefined,
  });

  return {
    base: appBase,
    plugins: [
      createMetadataPlugin(metadata),
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
  };
});
