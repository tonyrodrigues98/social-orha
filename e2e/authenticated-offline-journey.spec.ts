import { expect, test } from "playwright/test";
import {
  createNamedBrowserContext,
  e2eBaseUrl,
  requireNamedCredentials,
} from "./support/environment";

test.describe("reabertura autenticada sem conexão", () => {
  test("abre somente o shell, protege dados privados e retoma a sessão ao reconectar", async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    requireNamedCredentials("user-a");
    const context = await createNamedBrowserContext(browser, "user-a", {
      serviceWorkers: "allow",
    });
    const page = await context.newPage();

    try {
      await page.goto(e2eBaseUrl(), { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("navigation", { name: "Navegação principal" })).toBeVisible({
        timeout: 30_000,
      });
      await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.ready;
        if (!registration.active) throw new Error("Service worker não ativado.");
      });
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

      await context.setOffline(true);
      const offlineResponse = await page.reload({ waitUntil: "domcontentloaded" });
      expect(offlineResponse?.ok()).toBe(true);
      const boundary = page.locator('[data-offline-boundary="private-data"]');
      await expect(boundary).toBeVisible({ timeout: 30_000 });
      await expect(boundary).toContainText("dados privados");
      await expect(boundary).toContainText("automaticamente");

      await context.setOffline(false);
      await expect(
        page.getByRole("navigation", { name: "Navegação principal" }),
        "A reconexão precisa reidratar a identidade real sem reload manual.",
      ).toBeVisible({ timeout: 30_000 });
    } finally {
      await context.setOffline(false);
      await context.close();
    }
  });
});
