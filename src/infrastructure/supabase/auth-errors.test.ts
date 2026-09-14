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

  it("normaliza a exigência remota de comprimento sem depender do número do provedor", () => {
    expect(getAuthErrorMessage(new Error("Password should be at least 12 characters"))).toBe(
      "A senha precisa ter pelo menos 12 caracteres.",
    );
  });
});
