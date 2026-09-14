import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { expectedAppRoleForPrincipal } from "../e2e/support/environment";

const forbiddenTestDoubleApis = [
  /\b[A-Za-z_$][\w$]*\.route\s*\(/g,
  /\b[A-Za-z_$][\w$]*\.routeFromHAR\s*\(/g,
  /\broute\.fulfill\s*\(/g,
  /\baddInitScript\s*\(/g,
  /\b(?:localStorage|sessionStorage)\.setItem\s*\(/g,
  /\b(?:test|setup)\.(?:describe\.)?(?:skip|fixme)\s*\(/g,
] as const;

const requiredProductionJourneys = [
  "auth-lifecycle.spec.ts",
  "authenticated-broken-profile-media.spec.ts",
  "authenticated-navigation.spec.ts",
  "authenticated-profile-journey.spec.ts",
  "authenticated-security-session-journey.spec.ts",
  "authenticated-session-expiry.spec.ts",
  "authenticated-slow-network.spec.ts",
  "authenticated-viewport-matrix.spec.ts",
  "authenticated-webkit-matrix.spec.ts",
  "multiuser-community-journey.spec.ts",
  "multiuser-friendship-journey.spec.ts",
  "multiuser-messaging-journey.spec.ts",
  "multiuser-role-authority-journey.spec.ts",
  "multiuser-session.spec.ts",
  "multiuser-support-journey.spec.ts",
  "multiuser-trust-moderation-journey.spec.ts",
] as const;

function listTypeScript(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return listTypeScript(absolute);
    return /\.tsx?$/.test(entry.name) ? [absolute] : [];
  });
}

describe("E2E production contract", () => {
  it("does not intercept production requests or inject browser storage", () => {
    const violations = listTypeScript(path.resolve("e2e")).flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return forbiddenTestDoubleApis.flatMap((pattern) => {
        const matcher = new RegExp(pattern.source, pattern.flags);
        return Array.from(source.matchAll(matcher), (match) => ({
          file: path.relative(".", file).replaceAll("\\", "/"),
          api: match[0],
          line: source.slice(0, match.index).split(/\r?\n/).length,
        }));
      });
    });

    expect(violations).toEqual([]);
  });

  it("centralizes named-account contexts so native settings cannot drift", () => {
    const directContextCreation = listTypeScript(path.resolve("e2e"))
      .filter(
        (file) =>
          path.relative(".", file).replaceAll("\\", "/") !==
          "e2e/support/environment.ts",
      )
      .flatMap((file) => {
        const source = readFileSync(file, "utf8");
        return Array.from(
          source.matchAll(/\bbrowser\.newContext\s*\(/g),
          (match) => ({
            file: path.relative(".", file).replaceAll("\\", "/"),
            line: source.slice(0, match.index).split(/\r?\n/).length,
          }),
        );
      });

    expect(directContextCreation).toEqual([]);

    const environmentSource = readFileSync(
      path.resolve("e2e/support/environment.ts"),
      "utf8",
    );
    expect(environmentSource).toContain("signInWithPassword");
    expect(environmentSource).toContain("browserStorageStateForSession");
    expect(environmentSource).not.toContain(
      "storageState: authStatePath(principal)",
    );
  });

  it("binds every named principal to one exact backend role", () => {
    expect({
      "user-a": expectedAppRoleForPrincipal("user-a"),
      "user-b": expectedAppRoleForPrincipal("user-b"),
      admin: expectedAppRoleForPrincipal("admin"),
      moderator: expectedAppRoleForPrincipal("moderator"),
      support: expectedAppRoleForPrincipal("support"),
    }).toEqual({
      "user-a": "user",
      "user-b": "user",
      admin: "admin",
      moderator: "moderator",
      support: "support",
    });

    const setupSource = readFileSync(path.resolve("e2e/auth.setup.ts"), "utf8");
    expect(setupSource).toContain("assertE2EPrincipalProvisioning");
    expect(setupSource).toContain("readSupabaseSessionSubject");
  });

  it("keeps every authenticated production journey in the gate", () => {
    expect(
      requiredProductionJourneys.filter(
        (file) => !existsSync(path.resolve("e2e", file)),
      ),
    ).toEqual([]);

    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };
    const productionCommand =
      packageJson.scripts?.["test:e2e:production"] ?? "";
    expect(productionCommand).toContain("require-production-e2e-secrets.ts");
    expect(productionCommand).toContain("--project=public-*");
    expect(productionCommand).toContain(
      "--project=authenticated-chromium --workers=1",
    );
    expect(productionCommand).toContain(
      "--project=auth-lifecycle-chromium --workers=1",
    );
    expect(productionCommand).toContain(
      "--project=authenticated-webkit-390x844 --workers=1",
    );
    expect(packageJson.scripts?.["test:e2e"]).toBe(
      "npm run test:e2e:production",
    );
  });

  it("keeps authenticated CI journeys isolated from production Supabase", () => {
    const workflow = readFileSync(
      path.resolve(".github/workflows/deploy-pages.yml"),
      "utf8",
    );
    const e2eJob = workflow.match(
      /\n[ ]{2}e2e:\r?\n([\s\S]*?)\n[ ]{2}deploy:/,
    )?.[1];
    const buildJob = workflow.match(
      /\n[ ]{2}build:\r?\n([\s\S]*?)\n[ ]{2}e2e:/,
    )?.[1];

    expect(
      e2eJob,
      "O workflow precisa manter um job E2E dedicado.",
    ).toBeTruthy();
    expect(e2eJob).toContain(
      "ORHA_STAGING_SUPABASE_URL: ${{ vars.ORHA_STAGING_SUPABASE_URL }}",
    );
    expect(e2eJob).toContain(
      "ORHA_STAGING_SUPABASE_PUBLISHABLE_KEY: ${{ secrets.ORHA_STAGING_SUPABASE_PUBLISHABLE_KEY }}",
    );
    expect(e2eJob).toContain(
      "ORHA_E2E_SUPABASE_HOST: ${{ vars.ORHA_E2E_SUPABASE_HOST }}",
    );
    expect(e2eJob).not.toMatch(/https:\/\/[a-z0-9-]+\.supabase\.co/i);
    expect(e2eJob).not.toMatch(/\bsb_publishable_[A-Za-z0-9_-]+/);
    expect(e2eJob).not.toContain("VITE_SUPABASE_URL:");
    expect(e2eJob).not.toContain("VITE_SUPABASE_PUBLISHABLE_KEY:");

    expect(buildJob).toContain("VITE_SUPABASE_URL:");
    expect(buildJob).toContain("VITE_SUPABASE_PUBLISHABLE_KEY:");
  });
});
