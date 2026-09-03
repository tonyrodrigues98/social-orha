import path from "node:path";
import type { Browser, BrowserContext, Page } from "playwright/test";

export const AUTH_STATE_DIRECTORY = path.resolve("playwright/.auth");

export type TestPrincipal = "user-a" | "user-b" | "admin";

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
};

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

export function createNamedBrowserContext(
  browser: Browser,
  principal: TestPrincipal,
  options: { serviceWorkers?: "allow" | "block" } = {},
): Promise<BrowserContext> {
  return browser.newContext({
    baseURL: e2eBaseUrl(),
    storageState: authStatePath(principal),
    viewport: { width: 390, height: 844 },
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
    expectedProfileText: process.env[keys.expectedProfileText]?.trim() || undefined,
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
      if (!entry.name.startsWith("sb-") || !entry.name.endsWith("-auth-token")) {
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
