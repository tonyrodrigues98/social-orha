import { describe, expect, it } from "vitest";
import { canReuseHydratedIdentity } from "./auth-event-policy";

describe("auth event policy", () => {
  it.each(["SIGNED_IN", "TOKEN_REFRESHED", "USER_UPDATED"] as const)(
    "preserva a identidade hidratada no evento %s do mesmo usuário",
    (event) => {
      expect(canReuseHydratedIdentity(event, "user-a", "user-a")).toBe(true);
    },
  );

  it("não reutiliza identidade entre usuários", () => {
    expect(canReuseHydratedIdentity("USER_UPDATED", "user-a", "user-b")).toBe(false);
  });

  it("hidrata novamente eventos que podem alterar o fluxo de autenticação", () => {
    expect(canReuseHydratedIdentity("PASSWORD_RECOVERY", "user-a", "user-a")).toBe(false);
  });
});
