import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { vercelBuildConfigurationIssues } from "./require-vercel-build-configuration";
import {
  ORHA_PRODUCTION_SUPABASE_HOST,
  ORHA_STAGING_SUPABASE_HOST,
} from "./deployment-targets";

function baseEnvironment(target: "production" | "preview"): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    VERCEL_ENV: target,
    VERCEL_PROJECT_PRODUCTION_URL: "orha.example",
    VITE_ORHA_BASE_PATH: "/",
    VITE_SUPABASE_URL: `https://${target === "production" ? ORHA_PRODUCTION_SUPABASE_HOST : ORHA_STAGING_SUPABASE_HOST}`,
    VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_value",
  };
  if (target === "production") {
    Object.assign(environment, {
      VITE_ORHA_LEGAL_OPERATOR_NAME: "ORHA Operações",
      VITE_ORHA_LEGAL_CONTROLLER_NAME: "ORHA Operações",
      VITE_ORHA_LEGAL_ADDRESS: "Endereço público aprovado, São Paulo - SP",
      VITE_ORHA_LEGAL_FORUM: "Foro da Comarca de São Paulo - SP",
      VITE_ORHA_LEGAL_EFFECTIVE_DATE: "2026-09-14",
      VITE_ORHA_SUPPORT_EMAIL: "suporte@orha.example",
      VITE_ORHA_PRIVACY_EMAIL: "privacidade@orha.example",
    });
  }
  return environment;
}

describe("Vercel build preflight", () => {
  it("accepts production only with the production Supabase and legal configuration", () => {
    expect(vercelBuildConfigurationIssues(baseEnvironment("production"))).toEqual([]);
  });

  it("accepts preview only with the isolated staging Supabase", () => {
    expect(vercelBuildConfigurationIssues(baseEnvironment("preview"))).toEqual([]);
  });

  it("prevents preview deployments from reaching production data", () => {
    const environment = baseEnvironment("preview");
    environment.VITE_SUPABASE_URL = `https://${ORHA_PRODUCTION_SUPABASE_HOST}`;
    expect(vercelBuildConfigurationIssues(environment)).toContain(
      "invalid:VITE_SUPABASE_URL:preview-target-mismatch",
    );
  });

  it("prevents production deployments from reaching staging or publishing placeholders", () => {
    const environment = baseEnvironment("production");
    environment.VITE_SUPABASE_URL = `https://${ORHA_STAGING_SUPABASE_HOST}`;
    delete environment.VITE_ORHA_LEGAL_OPERATOR_NAME;
    expect(vercelBuildConfigurationIssues(environment)).toEqual(expect.arrayContaining([
      "invalid:VITE_SUPABASE_URL:production-target-mismatch",
      "missing:VITE_ORHA_LEGAL_OPERATOR_NAME",
    ]));
  });

  it("requires the Vercel root base, a public origin and a publishable key", () => {
    const environment = baseEnvironment("preview");
    environment.VITE_ORHA_BASE_PATH = "/social-orha/";
    delete environment.VERCEL_PROJECT_PRODUCTION_URL;
    environment.VITE_SUPABASE_PUBLISHABLE_KEY = "service-role-must-never-pass";
    expect(vercelBuildConfigurationIssues(environment)).toEqual(expect.arrayContaining([
      "invalid:VITE_ORHA_BASE_PATH:vercel-requires-root",
      "missing:public-origin-or-vercel-production-url",
      "invalid:VITE_SUPABASE_PUBLISHABLE_KEY:expected-publishable-key",
    ]));
  });

  it("is the mandatory Vercel build command", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8")) as {
      buildCommand?: string;
    };
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };
    expect(config.buildCommand).toBe("npm run build:vercel");
    expect(packageJson.scripts?.["build:vercel"]).toBe(
      "npm run audit:vercel-config && npm run build",
    );
  });
});
