/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_ORHA_SUPPORT_EMAIL?: string;
  readonly VITE_ORHA_BASE_PATH?: string;
  readonly VITE_ORHA_PUBLIC_ORIGIN?: string;
  readonly VITE_ORHA_POSTHOG_KEY?: string;
  readonly VITE_ORHA_POSTHOG_HOST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
