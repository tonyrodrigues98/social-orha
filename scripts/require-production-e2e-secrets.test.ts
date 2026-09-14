import { describe, expect, it } from "vitest";
import {
  missingProductionE2ESecrets,
  productionE2ESecretIssues,
  requiredProductionE2ESecrets,
} from "./require-production-e2e-secrets";

describe("production E2E secrets preflight", () => {
  function completeEnvironment(): Record<string, string> {
    return {
      ...Object.fromEntries(
        requiredProductionE2ESecrets.map((name) => [name, "configured"]),
      ),
      ORHA_STAGING_SUPABASE_URL: "https://staging-project.supabase.co",
      ORHA_STAGING_SUPABASE_PUBLISHABLE_KEY:
        "sb_publishable_test-only-placeholder",
      ORHA_E2E_SUPABASE_HOST: "staging-project.supabase.co",
      ORHA_E2E_USER_A_EMAIL: "a@example.test",
      ORHA_E2E_USER_B_EMAIL: "b@example.test",
      ORHA_E2E_ADMIN_EMAIL: "admin@example.test",
      ORHA_E2E_MODERATOR_EMAIL: "moderator@example.test",
      ORHA_E2E_SUPPORT_EMAIL: "support@example.test",
      ORHA_E2E_USER_A_PASSWORD: "primary-password",
      ORHA_E2E_USER_A_ROTATED_PASSWORD: "rotated-password",
      ORHA_E2E_EMAIL_DOMAIN: "e2e.example.com",
      ORHA_E2E_SMTP_DELIVERY_VERIFIED: "true",
    };
  }

  it("requires two users and the three operational roles with visible identity markers", () => {
    expect(missingProductionE2ESecrets({})).toEqual([
      ...requiredProductionE2ESecrets,
    ]);

    const complete = Object.fromEntries(
      requiredProductionE2ESecrets.map((name) => [name, "configured"]),
    );
    expect(missingProductionE2ESecrets(complete)).toEqual([]);
  });

  it("rejects reused principals and an unsafe rotation password", () => {
    const environment = completeEnvironment();
    Object.assign(environment, {
      ORHA_E2E_USER_A_EMAIL: "same@example.test",
      ORHA_E2E_USER_B_EMAIL: "same@example.test",
      ORHA_E2E_ADMIN_EMAIL: "admin@example.test",
      ORHA_E2E_MODERATOR_EMAIL: "moderator@example.test",
      ORHA_E2E_SUPPORT_EMAIL: "support@example.test",
      ORHA_E2E_USER_A_PASSWORD: "same",
      ORHA_E2E_USER_A_ROTATED_PASSWORD: "same",
      ORHA_E2E_EMAIL_DOMAIN: "e2e.example.com",
      ORHA_E2E_SMTP_DELIVERY_VERIFIED: "true",
    });

    expect(productionE2ESecretIssues(environment)).toEqual([
      "invalid:ORHA_E2E_USER_A_ROTATED_PASSWORD:min-length-12",
      "invalid:ORHA_E2E_USER_A_ROTATED_PASSWORD:must-differ",
      "invalid:named-principals:emails-must-be-distinct",
    ]);
  });

  it("accepts five distinct principals and a reversible password", () => {
    const environment = completeEnvironment();

    expect(productionE2ESecretIssues(environment)).toEqual([]);
  });

  it("rejects a non-explicit SMTP gate and an invalid catch-all domain", () => {
    const environment = completeEnvironment();
    Object.assign(environment, {
      ORHA_E2E_USER_A_EMAIL: "a@example.test",
      ORHA_E2E_USER_B_EMAIL: "b@example.test",
      ORHA_E2E_ADMIN_EMAIL: "admin@example.test",
      ORHA_E2E_USER_A_PASSWORD: "primary-password",
      ORHA_E2E_USER_A_ROTATED_PASSWORD: "rotated-password",
      ORHA_E2E_EMAIL_DOMAIN: "not-a-domain",
      ORHA_E2E_SMTP_DELIVERY_VERIFIED: "yes",
    });

    expect(productionE2ESecretIssues(environment)).toEqual([
      "invalid:ORHA_E2E_SMTP_DELIVERY_VERIFIED:must-equal-true",
      "invalid:ORHA_E2E_EMAIL_DOMAIN:expected-catch-all-domain",
    ]);
  });

  it("rejects a URL/host mismatch and the production Supabase target", () => {
    const mismatch = completeEnvironment();
    mismatch.ORHA_E2E_SUPABASE_HOST = "other-staging.supabase.co";
    expect(productionE2ESecretIssues(mismatch)).toContain(
      "invalid:staging-supabase:url-host-mismatch",
    );

    const production = completeEnvironment();
    production.ORHA_STAGING_SUPABASE_URL =
      "https://iuaczhkfmwpyhtpdmuyt.supabase.co";
    production.ORHA_E2E_SUPABASE_HOST = "iuaczhkfmwpyhtpdmuyt.supabase.co";
    expect(productionE2ESecretIssues(production)).toContain(
      "invalid:staging-supabase:production-target-forbidden",
    );
  });

  it("rejects malformed staging origins and host values", () => {
    const environment = completeEnvironment();
    environment.ORHA_STAGING_SUPABASE_URL =
      "http://staging-project.supabase.co/auth/v1";
    environment.ORHA_E2E_SUPABASE_HOST =
      "https://staging-project.supabase.co";

    expect(productionE2ESecretIssues(environment)).toEqual([
      "invalid:ORHA_STAGING_SUPABASE_URL:expected-https-origin",
      "invalid:ORHA_E2E_SUPABASE_HOST:expected-hostname",
    ]);
  });

  it("keeps authenticated journeys on the locally built staging client", () => {
    const environment = completeEnvironment();
    environment.ORHA_E2E_BASE_URL = "https://example.test/deployed-app/";

    expect(productionE2ESecretIssues(environment)).toContain(
      "invalid:ORHA_E2E_BASE_URL:authenticated-gate-requires-local-staging-build",
    );
  });
});
