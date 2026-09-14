import { describe, expect, it } from "vitest";
import {
  formatLegalEffectiveDate,
  legalPublicConfigurationFromEnvironment,
  normalizeIsoDate,
  normalizePublicEmail,
} from "./legal-public-configuration";

const completeEnvironment = {
  VITE_ORHA_LEGAL_OPERATOR_NAME: "ORHA Operações",
  VITE_ORHA_LEGAL_CONTROLLER_NAME: "ORHA Operações",
  VITE_ORHA_LEGAL_ADDRESS: "Endereço público aprovado, São Paulo - SP",
  VITE_ORHA_LEGAL_FORUM: "Foro da Comarca de São Paulo - SP",
  VITE_ORHA_LEGAL_EFFECTIVE_DATE: "2026-09-14",
  VITE_ORHA_SUPPORT_EMAIL: "SUPORTE@ORHA.EXAMPLE",
  VITE_ORHA_PRIVACY_EMAIL: "privacidade@orha.example",
} as const;

describe("public legal configuration", () => {
  it("normalizes an approved complete configuration", () => {
    expect(legalPublicConfigurationFromEnvironment(completeEnvironment)).toMatchObject({
      operatorName: "ORHA Operações",
      effectiveDate: "2026-09-14",
      supportEmail: "suporte@orha.example",
      privacyEmail: "privacidade@orha.example",
      missingKeys: [],
      isComplete: true,
    });
    expect(formatLegalEffectiveDate("2026-09-14")).toBe("14 de setembro de 2026");
  });

  it("rejects malformed dates, e-mails and header injection", () => {
    expect(normalizeIsoDate("2026-02-30")).toBeNull();
    expect(normalizePublicEmail("support@example.com\r\nBcc:target@example.com")).toBeNull();
    expect(normalizePublicEmail("not-an-email")).toBeNull();
  });

  it("reports every missing public field without inventing identity", () => {
    const configuration = legalPublicConfigurationFromEnvironment({});
    expect(configuration.isComplete).toBe(false);
    expect(configuration.missingKeys).toHaveLength(7);
    expect(configuration.operatorName).toBeNull();
  });
});
