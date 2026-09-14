import { describe, expect, it } from "vitest";
import {
  createEphemeralMatrixIdentity,
  MATRIX_PRINCIPALS,
  matrixEnvironment,
} from "./staging-e2e-matrix-contract";

describe("staging E2E matrix contract", () => {
  it("creates five isolated role identities without logging or persisting credentials", () => {
    const identities = MATRIX_PRINCIPALS.map((definition) =>
      createEphemeralMatrixIdentity(definition, "12345678-abcd-ef00"),
    );
    const environment = matrixEnvironment(identities);

    expect(new Set(identities.map((identity) => identity.email)).size).toBe(5);
    expect(new Set(identities.map((identity) => identity.username)).size).toBe(5);
    expect(identities.map((identity) => identity.role)).toEqual([
      "user",
      "user",
      "admin",
      "moderator",
      "support",
    ]);
    expect(environment.ORHA_E2E_USER_A_PROFILE_TEXT).toContain("Usuário A");
    expect(environment.ORHA_E2E_ADMIN_EMAIL).toMatch(/@example\.invalid$/);
    expect(environment.ORHA_E2E_USER_A_ROTATED_PASSWORD).not.toBe(
      environment.ORHA_E2E_USER_A_PASSWORD,
    );
  });

  it("rejects weak run identifiers and incomplete matrices", () => {
    expect(() =>
      createEphemeralMatrixIdentity(MATRIX_PRINCIPALS[0], "short"),
    ).toThrow("ao menos 8 caracteres");
    expect(() => matrixEnvironment([])).toThrow("exatamente cinco");
  });
});
