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

const destinations = [
  { path: "/inicio", heading: /Seu lugar começa/ },
  { path: "/comunidade", heading: "Comunidade" },
  { path: "/explorar", heading: "Explorar" },
  { path: "/conversas", heading: "Conversas" },
  { path: "/perfil", heading: "Perfil" },
] as const;

test.describe("WebKit autenticado native-first", () => {
  test("iPhone 390x844 preserva as cinco áreas com reduced motion", async ({
    browser,
  }, testInfo) => {
    test.setTimeout(120_000);
    const context = await createNamedBrowserContext(browser, "user-a", {
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    const quality = observeRuntimeQuality(page);

    try {
      await page.emulateMedia({ reducedMotion: "reduce" });
      for (const destination of destinations) {
        await openAppPath(page, destination.path);
        await waitForAuthenticatedShell(page);
        await expect(
          page.getByRole("heading", {
            level: 1,
            name: destination.heading,
          }),
        ).toBeVisible({ timeout: 30_000 });
        await expectBaselineAccessibility(page);
      }

      await testInfo.attach("orha-authenticated-webkit-390x844", {
        body: await page.screenshot({ fullPage: true }),
        contentType: "image/png",
      });
      quality.expectClean();
    } finally {
      await closeBrowserContexts([context]);
    }
  });
});
