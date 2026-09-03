import { test, expect } from "playwright/test";
import { signInThroughPublicUi, waitForPublicAuth } from "./support/auth-ui";
import { observeRuntimeQuality } from "./support/quality-gate";
import {
  authStatePath,
  currentAppPath,
  openAppPath,
  requireNamedCredentials,
} from "./support/environment";
import { waitForAuthenticatedShell } from "./support/journey-ui";

async function updatePassword(
  page: Parameters<typeof openAppPath>[0],
  currentPassword: string,
  nextPassword: string,
  onCommitted?: () => void,
): Promise<void> {
  await openAppPath(page, "/configuracoes");
  await page.getByRole("button", { name: "Segurança" }).click();
  await page.getByLabel("Senha atual").fill(currentPassword);
  await page.getByLabel("Nova senha").fill(nextPassword);
  await page.getByLabel("Confirmar nova senha").fill(nextPassword);
  const passwordUpdate = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith("/auth/v1/user") &&
      response.request().method() === "PUT",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: "Atualizar senha" }).click();
  const response = await passwordUpdate;
  expect(response.ok(), "A troca de senha precisa ser confirmada pelo Supabase.").toBe(true);
  onCommitted?.();
  await expect(page.getByRole("status").filter({ hasText: "Senha alterada com segurança" }))
    .toBeVisible({ timeout: 30_000 });
}

test.describe("jornada G — senha, logout, cache, sessão e deep links", () => {
  test.use({ storageState: authStatePath("user-a") });

  test("restaura senha, troca de conta sem vazar cache e preserva destino protegido", async ({ page }) => {
    test.setTimeout(180_000);
    const accountA = requireNamedCredentials("user-a");
    const accountB = requireNamedCredentials("user-b");
    const rotatedPassword = process.env.ORHA_E2E_USER_A_ROTATED_PASSWORD?.trim();
    if (!rotatedPassword || rotatedPassword.length < 12 || rotatedPassword === accountA.password) {
      throw new Error(
        "ORHA_E2E_USER_A_ROTATED_PASSWORD deve ser diferente da senha principal e ter ao menos 12 caracteres.",
      );
    }
    const quality = observeRuntimeQuality(page);
    const passwordState: { value: "primary" | "rotated" } = {
      value: "primary",
    };

    try {
      await openAppPath(page, "/perfil");
      await waitForAuthenticatedShell(page);
      await expect(page.getByText(accountA.expectedProfileText!)).toBeVisible();

      await updatePassword(
        page,
        accountA.password,
        rotatedPassword,
        () => { passwordState.value = "rotated"; },
      );
      await updatePassword(
        page,
        rotatedPassword,
        accountA.password,
        () => { passwordState.value = "primary"; },
      );

      await openAppPath(page, "/perfil");
      await page.getByRole("button", { name: "Sair da conta" }).click();
      await waitForPublicAuth(page);
      await expect.poll(() => currentAppPath(page)).toBe("/auth/login");
      await signInThroughPublicUi(page, accountB);
      await openAppPath(page, "/perfil");
      await expect(page.getByText(accountB.expectedProfileText!)).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(accountA.expectedProfileText!)).toHaveCount(0);

      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByText(accountB.expectedProfileText!)).toBeVisible({ timeout: 30_000 });
      await openAppPath(page, "/perfil");
      await page.getByRole("button", { name: "Sair da conta" }).click();
      await waitForPublicAuth(page);

      const deepConversation = "/conversas/00000000-0000-4000-8000-000000000099";
      await openAppPath(page, deepConversation);
      await waitForPublicAuth(page);
      await expect.poll(() => currentAppPath(page)).toBe("/auth/login");
      expect(new URL(page.url()).searchParams.get("redirect")).toBe(deepConversation);
      await signInThroughPublicUi(page, accountA);
      await expect.poll(() => currentAppPath(page)).toBe(deepConversation);
      await expect(page.getByRole("heading", { level: 1, name: "Conversa" })).toBeVisible({ timeout: 30_000 });
      await expect(
        page.getByText("Esta conversa não existe ou você não tem acesso a ela."),
      ).toBeVisible({ timeout: 30_000 });

      await openAppPath(page, "/configuracoes");
      await expect(page.getByRole("heading", { level: 1, name: "Configurações" })).toBeVisible();
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { level: 1, name: "Configurações" })).toBeVisible();

      quality.expectClean();
    } finally {
      if (passwordState.value === "rotated") {
        await updatePassword(
          page,
          rotatedPassword,
          accountA.password,
          () => { passwordState.value = "primary"; },
        );
      }
    }
  });
});
