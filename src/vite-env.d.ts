/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_ORHA_SUPPORT_EMAIL?: string;
  readonly VITE_ORHA_PRIVACY_EMAIL?: string;
  readonly VITE_ORHA_LEGAL_OPERATOR_NAME?: string;
  readonly VITE_ORHA_LEGAL_CONTROLLER_NAME?: string;
  readonly VITE_ORHA_LEGAL_ADDRESS?: string;
  readonly VITE_ORHA_LEGAL_FORUM?: string;
  readonly VITE_ORHA_LEGAL_EFFECTIVE_DATE?: string;
  readonly VITE_ORHA_BASE_PATH?: string;
  readonly VITE_ORHA_PUBLIC_ORIGIN?: string;
  readonly VITE_ORHA_POSTHOG_KEY?: string;
  readonly VITE_ORHA_POSTHOG_HOST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
