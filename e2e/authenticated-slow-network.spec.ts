import { expect, test } from "playwright/test";
import {
  createNamedBrowserContext,
  openAppPath,
} from "./support/environment";
import {
  expectBaselineAccessibility,
  observeRuntimeQuality,
} from "./support/quality-gate";
import {
  closeBrowserContexts,
  waitForAuthenticatedShell,
} from "./support/journey-ui";

test.describe("rede móvel lenta autenticada", () => {
  test("mantém o launch state e carrega dados privados sob latência", async ({
    browser,
  }, testInfo) => {
    test.setTimeout(180_000);
    const context = await createNamedBrowserContext(browser, "user-a");
    const page = await context.newPage();
    const quality = observeRuntimeQuality(page);
    const cdp = await context.newCDPSession(page);

    try {
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: 650,
        downloadThroughput: 1024 * 1024,
        uploadThroughput: 512 * 1024,
        connectionType: "cellular3g",
      });
      await openAppPath(page, "/inicio");
      await expect(page.locator(".native-app-shell")).toBeVisible({
        timeout: 30_000,
      });
      await waitForAuthenticatedShell(page);
      await expect(
        page.getByRole("heading", { level: 1, name: /Seu lugar começa/ }),
      ).toBeVisible({ timeout: 45_000 });

      await openAppPath(page, "/notificacoes");
      await expect(
        page.getByRole("heading", { level: 1, name: "Notificações" }),
      ).toBeVisible({ timeout: 45_000 });
      await expectBaselineAccessibility(page);
      await testInfo.attach("orha-private-slow-network", {
        body: await page.screenshot({ fullPage: true }),
        contentType: "image/png",
      });
      quality.expectClean();
    } finally {
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      }).catch(() => undefined);
      await cdp.detach().catch(() => undefined);
      await closeBrowserContexts([context]);
    }
  });
});
