import { describe, expect, it } from "vitest";
import { getAuthErrorMessage } from "./auth-errors";

describe("auth error localization", () => {
  it("translates invalid credentials without leaking provider wording", () => {
    expect(getAuthErrorMessage(new Error("Invalid login credentials"))).toBe(
      "E-mail ou senha incorretos.",
    );
  });

  it("uses a safe fallback for unknown failures", () => {
    expect(getAuthErrorMessage(new Error("internal detail"))).toBe(
      "Não foi possível concluir. Tente novamente.",
    );
  });
});
