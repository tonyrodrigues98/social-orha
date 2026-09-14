import path from "node:path";
import { fileURLToPath } from "node:url";

export const requiredProductionE2ESecrets = [
  "ORHA_STAGING_SUPABASE_URL",
  "ORHA_STAGING_SUPABASE_PUBLISHABLE_KEY",
  "ORHA_E2E_SUPABASE_HOST",
  "ORHA_E2E_USER_A_EMAIL",
  "ORHA_E2E_USER_A_PASSWORD",
  "ORHA_E2E_USER_A_PROFILE_TEXT",
  "ORHA_E2E_USER_A_ROTATED_PASSWORD",
  "ORHA_E2E_USER_B_EMAIL",
  "ORHA_E2E_USER_B_PASSWORD",
  "ORHA_E2E_USER_B_PROFILE_TEXT",
  "ORHA_E2E_ADMIN_EMAIL",
  "ORHA_E2E_ADMIN_PASSWORD",
  "ORHA_E2E_ADMIN_PROFILE_TEXT",
  "ORHA_E2E_MODERATOR_EMAIL",
  "ORHA_E2E_MODERATOR_PASSWORD",
  "ORHA_E2E_MODERATOR_PROFILE_TEXT",
  "ORHA_E2E_SUPPORT_EMAIL",
  "ORHA_E2E_SUPPORT_PASSWORD",
  "ORHA_E2E_SUPPORT_PROFILE_TEXT",
  "ORHA_E2E_SERVICE_ROLE_KEY",
  "ORHA_E2E_EMAIL_DOMAIN",
  "ORHA_E2E_SMTP_DELIVERY_VERIFIED",
] as const;

const PRODUCTION_SUPABASE_HOST = "iuaczhkfmwpyhtpdmuyt.supabase.co";

export function missingProductionE2ESecrets(
  environment: NodeJS.ProcessEnv,
): string[] {
  return requiredProductionE2ESecrets.filter(
    (name) => !environment[name]?.trim(),
  );
}

export function productionE2ESecretIssues(
  environment: NodeJS.ProcessEnv,
): string[] {
  const missing = missingProductionE2ESecrets(environment);
  if (missing.length > 0) return missing.map((name) => `missing:${name}`);

  const issues: string[] = [];
  const configuredStagingHost =
    environment.ORHA_E2E_SUPABASE_HOST!.trim().toLowerCase();
  let stagingUrl: URL | null = null;
  try {
    stagingUrl = new URL(environment.ORHA_STAGING_SUPABASE_URL!.trim());
    const isHttpsOrigin =
      stagingUrl.protocol === "https:" &&
      stagingUrl.username === "" &&
      stagingUrl.password === "" &&
      (stagingUrl.pathname === "/" || stagingUrl.pathname === "") &&
      stagingUrl.search === "" &&
      stagingUrl.hash === "";
    if (!isHttpsOrigin) {
      issues.push("invalid:ORHA_STAGING_SUPABASE_URL:expected-https-origin");
    }
  } catch {
    issues.push("invalid:ORHA_STAGING_SUPABASE_URL:expected-https-origin");
  }

  const hostIsBareHostname =
    configuredStagingHost !== "" &&
    !configuredStagingHost.includes("://") &&
    !/[/?#\s]/.test(configuredStagingHost);
  if (!hostIsBareHostname) {
    issues.push("invalid:ORHA_E2E_SUPABASE_HOST:expected-hostname");
  } else if (
    stagingUrl &&
    stagingUrl.host.toLowerCase() !== configuredStagingHost
  ) {
    issues.push("invalid:staging-supabase:url-host-mismatch");
  }

  if (
    configuredStagingHost === PRODUCTION_SUPABASE_HOST ||
    stagingUrl?.host.toLowerCase() === PRODUCTION_SUPABASE_HOST
  ) {
    issues.push("invalid:staging-supabase:production-target-forbidden");
  }
  if (environment.ORHA_E2E_BASE_URL?.trim()) {
    issues.push(
      "invalid:ORHA_E2E_BASE_URL:authenticated-gate-requires-local-staging-build",
    );
  }

  const primaryPassword = environment.ORHA_E2E_USER_A_PASSWORD!.trim();
  const rotatedPassword = environment.ORHA_E2E_USER_A_ROTATED_PASSWORD!.trim();
  if (rotatedPassword.length < 12) {
    issues.push("invalid:ORHA_E2E_USER_A_ROTATED_PASSWORD:min-length-12");
  }
  if (rotatedPassword === primaryPassword) {
    issues.push("invalid:ORHA_E2E_USER_A_ROTATED_PASSWORD:must-differ");
  }

  const normalizedEmails = [
    environment.ORHA_E2E_USER_A_EMAIL!,
    environment.ORHA_E2E_USER_B_EMAIL!,
    environment.ORHA_E2E_ADMIN_EMAIL!,
    environment.ORHA_E2E_MODERATOR_EMAIL!,
    environment.ORHA_E2E_SUPPORT_EMAIL!,
  ].map((value) => value.trim().toLowerCase());
  if (new Set(normalizedEmails).size !== normalizedEmails.length) {
    issues.push("invalid:named-principals:emails-must-be-distinct");
  }
  if (environment.ORHA_E2E_SMTP_DELIVERY_VERIFIED!.trim() !== "true") {
    issues.push("invalid:ORHA_E2E_SMTP_DELIVERY_VERIFIED:must-equal-true");
  }
  if (
    !/^(?!-)(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(
      environment.ORHA_E2E_EMAIL_DOMAIN!.trim(),
    )
  ) {
    issues.push("invalid:ORHA_E2E_EMAIL_DOMAIN:expected-catch-all-domain");
  }

  return issues;
}

function runPreflight(): void {
  const issues = productionE2ESecretIssues(process.env);
  if (issues.length > 0) {
    console.error(
      `Production E2E requires an isolated staging Supabase and valid named sessions. Issues: ${issues.join(", ")}`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    "Production E2E isolated-staging, named-session and Auth-lifecycle preflight passed.",
  );
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  runPreflight();
}
