import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { launchConfigurationIssues } from "./require-launch-configuration";

function completeEnvironment(): NodeJS.ProcessEnv {
  return {
    VITE_ORHA_LEGAL_OPERATOR_NAME: "ORHA Operações",
    VITE_ORHA_LEGAL_CONTROLLER_NAME: "ORHA Operações",
    VITE_ORHA_LEGAL_ADDRESS: "Endereço público aprovado, São Paulo - SP",
    VITE_ORHA_LEGAL_FORUM: "Foro da Comarca de São Paulo - SP",
    VITE_ORHA_LEGAL_EFFECTIVE_DATE: "2026-09-14",
    VITE_ORHA_SUPPORT_EMAIL: "suporte@orha.example",
    VITE_ORHA_PRIVACY_EMAIL: "privacidade@orha.example",
  };
}

describe("public launch configuration gate", () => {
  it("fails closed when legal and contact values are absent", () => {
    expect(launchConfigurationIssues({})).toEqual([
      "missing:VITE_ORHA_LEGAL_OPERATOR_NAME",
      "missing:VITE_ORHA_LEGAL_CONTROLLER_NAME",
      "missing:VITE_ORHA_LEGAL_ADDRESS",
      "missing:VITE_ORHA_LEGAL_FORUM",
      "missing:VITE_ORHA_LEGAL_EFFECTIVE_DATE",
      "missing:VITE_ORHA_SUPPORT_EMAIL",
      "missing:VITE_ORHA_PRIVACY_EMAIL",
    ]);
  });

  it("rejects configured but malformed values", () => {
    const environment = completeEnvironment();
    environment.VITE_ORHA_LEGAL_EFFECTIVE_DATE = "14/09/2026";
    environment.VITE_ORHA_PRIVACY_EMAIL = "invalid";

    expect(launchConfigurationIssues(environment)).toEqual([
      "invalid:VITE_ORHA_LEGAL_EFFECTIVE_DATE",
      "invalid:VITE_ORHA_PRIVACY_EMAIL",
    ]);
  });

  it("accepts the complete public configuration", () => {
    expect(launchConfigurationIssues(completeEnvironment())).toEqual([]);
  });

  it("runs before the deploy build with every public value supplied by GitHub variables", () => {
    const workflow = readFileSync(".github/workflows/deploy-pages.yml", "utf8");
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["audit:launch-config"]).toBe(
      "tsx scripts/require-launch-configuration.ts",
    );
    expect(workflow.indexOf("run: npm run audit:launch-config")).toBeLessThan(
      workflow.indexOf("run: npm run build"),
    );
    for (const key of Object.keys(completeEnvironment())) {
      expect(workflow).toContain(`${key}: \${{ vars.${key} }}`);
    }
  });
});
