import {
  expect,
  expectBaselineAccessibility,
  test,
} from "./support/quality-gate";
import { waitForPublicAuth } from "./support/auth-ui";
import { openApp } from "./support/environment";

test.describe("qualidade pública em viewports suportadas", () => {
  test("login não tem regressões básicas de a11y, zoom ou overflow", async ({
    page,
  }) => {
    await openApp(page);
    await waitForPublicAuth(page);
    await expectBaselineAccessibility(page);
  });

  test("cadastro mantém a semântica e campos seguros no iOS", async ({ page }) => {
    await openApp(page);
    await waitForPublicAuth(page);
    await page.getByRole("button", { name: "Criar conta" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Criar uma conta" }),
    ).toBeVisible();
    await expectBaselineAccessibility(page);
  });

  test("recuperação de senha mantém a mesma linha de qualidade", async ({
    page,
  }) => {
    await openApp(page);
    await waitForPublicAuth(page);
    await page.getByRole("button", { name: "Esqueci minha senha" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Esqueceu sua senha?" }),
    ).toBeVisible();
    await expectBaselineAccessibility(page);
  });

  test("prefers-reduced-motion preserva o fluxo funcional", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openApp(page);
    await waitForPublicAuth(page);
    await expect(page.getByLabel("E-mail")).toBeEditable();
    await expect(page.getByLabel(/^Senha\b/)).toBeEditable();
  });
});
