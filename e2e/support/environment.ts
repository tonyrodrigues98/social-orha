import path from "node:path";
import { createClient, type Session } from "@supabase/supabase-js";
import type {
  Browser,
  BrowserContext,
  BrowserContextOptions,
  Page,
} from "playwright/test";

export const AUTH_STATE_DIRECTORY = path.resolve("playwright/.auth");

export type TestPrincipal =
  "user-a" | "user-b" | "admin" | "moderator" | "support";
export type ExpectedAppRole = "user" | "admin" | "moderator" | "support";

export type NamedCredentials = {
  email: string;
  password: string;
  expectedProfileText?: string;
};

const PRINCIPAL_ENV_KEYS: Record<
  TestPrincipal,
  { email: string; password: string; expectedProfileText: string }
> = {
  "user-a": {
    email: "ORHA_E2E_USER_A_EMAIL",
    password: "ORHA_E2E_USER_A_PASSWORD",
    expectedProfileText: "ORHA_E2E_USER_A_PROFILE_TEXT",
  },
  "user-b": {
    email: "ORHA_E2E_USER_B_EMAIL",
    password: "ORHA_E2E_USER_B_PASSWORD",
    expectedProfileText: "ORHA_E2E_USER_B_PROFILE_TEXT",
  },
  admin: {
    email: "ORHA_E2E_ADMIN_EMAIL",
    password: "ORHA_E2E_ADMIN_PASSWORD",
    expectedProfileText: "ORHA_E2E_ADMIN_PROFILE_TEXT",
  },
  moderator: {
    email: "ORHA_E2E_MODERATOR_EMAIL",
    password: "ORHA_E2E_MODERATOR_PASSWORD",
    expectedProfileText: "ORHA_E2E_MODERATOR_PROFILE_TEXT",
  },
  support: {
    email: "ORHA_E2E_SUPPORT_EMAIL",
    password: "ORHA_E2E_SUPPORT_PASSWORD",
    expectedProfileText: "ORHA_E2E_SUPPORT_PROFILE_TEXT",
  },
};

const EXPECTED_APP_ROLES: Record<TestPrincipal, ExpectedAppRole> = {
  "user-a": "user",
  "user-b": "user",
  admin: "admin",
  moderator: "moderator",
  support: "support",
};

export function expectedAppRoleForPrincipal(
  principal: TestPrincipal,
): ExpectedAppRole {
  return EXPECTED_APP_ROLES[principal];
}

export function authStatePath(principal: TestPrincipal): string {
  return path.join(AUTH_STATE_DIRECTORY, `${principal}.json`);
}

export function e2eBaseUrl(): string {
  const configured = process.env.ORHA_E2E_BASE_URL?.trim();
  const local = process.env.GITHUB_ACTIONS
    ? "http://127.0.0.1:4173/social-orha/"
    : "http://127.0.0.1:4173/";
  const base = configured || local;
  return base.endsWith("/") ? base : `${base}/`;
}

function stagingBrowserCredentials(): { url: string; publishableKey: string } {
  const url = process.env.ORHA_STAGING_SUPABASE_URL?.trim();
  const publishableKey =
    process.env.ORHA_STAGING_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey) {
    throw new Error(
      "ORHA_STAGING_SUPABASE_URL e ORHA_STAGING_SUPABASE_PUBLISHABLE_KEY são obrigatórias para criar uma sessão E2E isolada.",
    );
  }
  if (new URL(url).host !== expectedSupabaseHost()) {
    throw new Error(
      "A URL usada para autenticar o contexto E2E não corresponde ao host de staging esperado.",
    );
  }
  return { url, publishableKey };
}

function supabaseAuthStorageKey(url: string): string {
  const projectRef = new URL(url).hostname.split(".")[0];
  if (!projectRef) {
    throw new Error(
      "A URL de staging não contém um project ref Supabase válido.",
    );
  }
  return `sb-${projectRef}-auth-token`;
}

function browserStorageStateForSession(
  url: string,
  session: Session,
): BrowserContextOptions["storageState"] {
  return {
    cookies: [],
    origins: [
      {
        origin: new URL(e2eBaseUrl()).origin,
        localStorage: [
          {
            name: supabaseAuthStorageKey(url),
            value: JSON.stringify(session),
          },
        ],
      },
    ],
  };
}

/**
 * Creates a new Supabase session for every browser context.
 *
 * Supabase rotates refresh tokens. Reusing a saved Playwright storageState in
 * several sequential contexts therefore makes a later journey inherit a token
 * that an earlier context already consumed. A fresh password sign-in keeps the
 * identities stable while isolating the session lifecycle of every journey.
 */
export async function createNamedBrowserContext(
  browser: Browser,
  principal: TestPrincipal,
  options: {
    serviceWorkers?: "allow" | "block";
    viewport?: { width: number; height: number };
    deviceScaleFactor?: number;
    hasTouch?: boolean;
    isMobile?: boolean;
  } = {},
): Promise<BrowserContext> {
  const credentials = requireNamedCredentials(principal);
  const staging = stagingBrowserCredentials();
  const authClient = createClient(staging.url, staging.publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const signedIn = await authClient.auth.signInWithPassword({
    email: credentials.email,
    password: credentials.password,
  });
  if (signedIn.error || !signedIn.data.session) {
    throw new Error(
      `Não foi possível criar uma sessão isolada para a identidade E2E ${principal}.`,
    );
  }

  return browser.newContext({
    baseURL: e2eBaseUrl(),
    storageState: browserStorageStateForSession(
      staging.url,
      signedIn.data.session,
    ),
    viewport: options.viewport ?? { width: 390, height: 844 },
    deviceScaleFactor: options.deviceScaleFactor,
    hasTouch: options.hasTouch,
    isMobile: options.isMobile,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    serviceWorkers: options.serviceWorkers ?? "block",
  });
}

export function createAnonymousBrowserContext(
  browser: Browser,
): Promise<BrowserContext> {
  return browser.newContext({
    baseURL: e2eBaseUrl(),
    viewport: { width: 390, height: 844 },
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    serviceWorkers: "block",
  });
}

export function getNamedCredentials(
  principal: TestPrincipal,
): NamedCredentials | null {
  const keys = PRINCIPAL_ENV_KEYS[principal];
  const email = process.env[keys.email]?.trim();
  const password = process.env[keys.password];
  if (!email || !password) return null;

  return {
    email,
    password,
    expectedProfileText:
      process.env[keys.expectedProfileText]?.trim() || undefined,
  };
}

export function hasNamedCredentials(principal: TestPrincipal): boolean {
  return getNamedCredentials(principal) !== null;
}

export function requireNamedCredentials(
  principal: TestPrincipal,
): NamedCredentials {
  const credentials = getNamedCredentials(principal);
  if (!credentials) {
    throw new Error(
      `Credenciais E2E reais ausentes para ${principal}. Execute o preflight de produção e configure os secrets nomeados.`,
    );
  }
  if (!credentials.expectedProfileText) {
    const principalKey = principal.replace("-", "_").toUpperCase();
    throw new Error(
      `ORHA_E2E_${principalKey}_PROFILE_TEXT é obrigatório para provar visualmente a identidade da conta.`,
    );
  }
  return credentials;
}

/** Resolves both `/` locally and `/social-orha/` on GitHub Pages. */
export async function openApp(page: Page): Promise<void> {
  await page.goto(e2eBaseUrl(), { waitUntil: "domcontentloaded" });
}

export async function openAppPath(page: Page, appPath: string): Promise<void> {
  const normalized = appPath.replace(/^\/+/, "");
  await page.goto(new URL(normalized, e2eBaseUrl()).toString(), {
    waitUntil: "domcontentloaded",
  });
}

export function currentAppPath(page: Page): string {
  const pathname = new URL(page.url()).pathname.replace(/\/$/, "") || "/";
  const configuredBase = new URL(e2eBaseUrl()).pathname.replace(/\/$/, "");
  if (configuredBase && pathname.startsWith(configuredBase)) {
    return pathname.slice(configuredBase.length) || "/";
  }
  return pathname;
}

export function expectedSupabaseHost(): string {
  const configuredHost = process.env.ORHA_E2E_SUPABASE_HOST?.trim();
  if (configuredHost) return configuredHost.toLowerCase();

  const configuredUrl =
    process.env.ORHA_STAGING_SUPABASE_URL?.trim() ||
    process.env.VITE_SUPABASE_URL?.trim();
  if (configuredUrl) {
    try {
      return new URL(configuredUrl).host;
    } catch {
      // The staging preflight reports malformed configuration before auth E2E.
    }
  }

  // Public-only tests merely detect whether an invalid form reached any
  // Supabase project. Authenticated gates always provide the exact staging host.
  return "supabase.co";
}

type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

/**
 * Reads only the JWT subject from Playwright's ephemeral, gitignored state.
 * It never logs or snapshots tokens, e-mails, user ids, or passwords.
 */
export function readSupabaseSessionSubject(state: StorageState): string | null {
  for (const origin of state.origins) {
    for (const entry of origin.localStorage) {
      if (
        !entry.name.startsWith("sb-") ||
        !entry.name.endsWith("-auth-token")
      ) {
        continue;
      }

      try {
        const serialized = entry.value.startsWith("base64-")
          ? Buffer.from(entry.value.slice("base64-".length), "base64").toString(
              "utf8",
            )
          : entry.value;
        const session = JSON.parse(serialized) as { access_token?: string };
        const tokenPayload = session.access_token?.split(".")[1];
        if (!tokenPayload) return null;
        const normalized = tokenPayload.replace(/-/g, "+").replace(/_/g, "/");
        const payload = JSON.parse(
          Buffer.from(normalized, "base64").toString("utf8"),
        ) as { sub?: string };
        return payload.sub ?? null;
      } catch {
        return null;
      }
    }
  }
  return null;
}
