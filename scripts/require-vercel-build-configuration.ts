import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchConfigurationIssues } from "./require-launch-configuration";
import {
  ORHA_PRODUCTION_SUPABASE_HOST,
  ORHA_STAGING_SUPABASE_HOST,
} from "./deployment-targets";
import { normalizeAppBase, resolvePublicOrigin } from "./site-config";

type VercelEnvironment = "production" | "preview";

function normalizedSupabaseHost(value?: string): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    const isHttpsOrigin = url.protocol === "https:"
      && !url.username
      && !url.password
      && (url.pathname === "/" || url.pathname === "")
      && !url.search
      && !url.hash;
    return isHttpsOrigin ? url.host.toLowerCase() : null;
  } catch {
    return null;
  }
}

function vercelEnvironment(value?: string): VercelEnvironment | null {
  return value === "production" || value === "preview" ? value : null;
}

export function vercelBuildConfigurationIssues(
  environment: NodeJS.ProcessEnv,
): string[] {
  const issues: string[] = [];
  const target = vercelEnvironment(environment.VERCEL_ENV);
  if (!target) issues.push("invalid:VERCEL_ENV:expected-production-or-preview");

  if (!environment.VITE_ORHA_BASE_PATH?.trim()) {
    issues.push("missing:VITE_ORHA_BASE_PATH");
  } else {
    try {
      if (normalizeAppBase(environment.VITE_ORHA_BASE_PATH) !== "/") {
        issues.push("invalid:VITE_ORHA_BASE_PATH:vercel-requires-root");
      }
    } catch {
      issues.push("invalid:VITE_ORHA_BASE_PATH:vercel-requires-root");
    }
  }

  try {
    if (!resolvePublicOrigin(environment)) {
      issues.push("missing:public-origin-or-vercel-production-url");
    }
  } catch {
    issues.push("invalid:VITE_ORHA_PUBLIC_ORIGIN:expected-https-origin");
  }

  const supabaseHost = normalizedSupabaseHost(environment.VITE_SUPABASE_URL);
  if (!supabaseHost) {
    issues.push(
      environment.VITE_SUPABASE_URL?.trim()
        ? "invalid:VITE_SUPABASE_URL:expected-https-origin"
        : "missing:VITE_SUPABASE_URL",
    );
  } else if (target) {
    const expectedHost = target === "production"
      ? ORHA_PRODUCTION_SUPABASE_HOST
      : ORHA_STAGING_SUPABASE_HOST;
    if (supabaseHost !== expectedHost) {
      issues.push(`invalid:VITE_SUPABASE_URL:${target}-target-mismatch`);
    }
  }

  const publishableKey = environment.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!publishableKey) {
    issues.push("missing:VITE_SUPABASE_PUBLISHABLE_KEY");
  } else if (!/^sb_publishable_[A-Za-z0-9_-]{8,}$/.test(publishableKey)) {
    issues.push("invalid:VITE_SUPABASE_PUBLISHABLE_KEY:expected-publishable-key");
  }

  if (target === "production") issues.push(...launchConfigurationIssues(environment));
  return issues;
}

function run(): void {
  const issues = vercelBuildConfigurationIssues(process.env);
  if (issues.length > 0) {
    console.error(`Vercel build configuration rejected. Issues: ${issues.join(", ")}`);
    process.exitCode = 1;
    return;
  }
  console.log("Vercel environment, public origin and Supabase target checks passed.");
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) run();
