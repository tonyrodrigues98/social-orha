import { expect, test, type BrowserContext, type Page } from "playwright/test";
import { observeRuntimeQuality } from "./support/quality-gate";
import {
  createNamedBrowserContext,
  currentAppPath,
  openAppPath,
  requireNamedCredentials,
  type TestPrincipal,
} from "./support/environment";
import { closeBrowserContexts } from "./support/journey-ui";

async function expectDenied(page: Page, path: string): Promise<void> {
  await openAppPath(page, path);
  await expect.poll(() => currentAppPath(page)).toBe("/inicio");
  await expect(page.getByRole("heading", { level: 1, name: /Seu lugar começa/ })).toBeVisible();
}

test.describe("autoridade real das funções operacionais", () => {
  test("Usuário, Suporte, Moderador e Admin recebem somente suas rotas", async ({ browser }) => {
    test.setTimeout(150_000);
    const principals: readonly TestPrincipal[] = ["user-a", "support", "moderator", "admin"];
    principals.forEach((principal) => requireNamedCredentials(principal));
    const contexts: BrowserContext[] = await Promise.all(
      principals.map((principal) => createNamedBrowserContext(browser, principal)),
    );
    const [userContext, supportContext, moderatorContext, adminContext] = contexts;
    const [userPage, supportPage, moderatorPage, adminPage] = await Promise.all([
      userContext.newPage(),
      supportContext.newPage(),
      moderatorContext.newPage(),
      adminContext.newPage(),
    ]);
    const quality = [userPage, supportPage, moderatorPage, adminPage].map(observeRuntimeQuality);

    try {
      await expectDenied(userPage, "/admin/moderacao");
      await expectDenied(userPage, "/admin/funcoes");

      await openAppPath(supportPage, "/suporte");
      await expect(supportPage.getByRole("heading", { level: 1, name: "Fila de suporte" })).toBeVisible();
      await expectDenied(supportPage, "/admin/moderacao");
      await expectDenied(supportPage, "/admin/funcoes");

      await openAppPath(moderatorPage, "/admin/moderacao");
      await expect(moderatorPage.getByRole("heading", { level: 1, name: "Moderação" })).toBeVisible();
      await expectDenied(moderatorPage, "/admin/funcoes");

      await openAppPath(adminPage, "/admin/moderacao");
      await expect(adminPage.getByRole("heading", { level: 1, name: "Moderação" })).toBeVisible();
      await openAppPath(adminPage, "/admin/funcoes");
      await expect(adminPage.getByRole("heading", { level: 1, name: "Funções da equipe" })).toBeVisible();

      quality.forEach((observer) => observer.expectClean());
    } finally {
      await closeBrowserContexts(contexts);
    }
  });
});
