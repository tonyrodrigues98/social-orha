import { expect, test } from "playwright/test";
import { createNamedBrowserContext, openAppPath } from "./support/environment";
import {
  expectBaselineAccessibility,
  observeRuntimeQuality,
} from "./support/quality-gate";
import {
  closeBrowserContexts,
  waitForAuthenticatedShell,
} from "./support/journey-ui";

const viewports = [
  { name: "320x568", width: 320, height: 568, touch: true },
  { name: "375x667", width: 375, height: 667, touch: true },
  { name: "390x844", width: 390, height: 844, touch: true },
  { name: "393x852", width: 393, height: 852, touch: true },
  { name: "430x932", width: 430, height: 932, touch: true },
  { name: "440x932", width: 440, height: 932, touch: true },
  { name: "tablet-768x1024", width: 768, height: 1024, touch: true },
  { name: "tablet-1024x768", width: 1024, height: 768, touch: true },
  { name: "1280x800", width: 1280, height: 800, touch: false },
  { name: "1440x900", width: 1440, height: 900, touch: false },
] as const;

const destinations = [
  { path: "/inicio", heading: /Seu lugar começa/ },
  { path: "/comunidade", heading: "Comunidade" },
  { path: "/explorar", heading: "Explorar" },
  { path: "/conversas", heading: "Conversas" },
  { path: "/perfil", heading: "Perfil" },
] as const;

test.describe("matriz native-first autenticada", () => {
  test.describe.configure({ mode: "serial" });

  for (const viewport of viewports) {
    test(`${viewport.name} preserva as cinco áreas sem zoom ou overflow`, async ({
      browser,
    }, testInfo) => {
      test.setTimeout(120_000);
      const context = await createNamedBrowserContext(browser, "user-a", {
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: viewport.touch ? 3 : 1,
        hasTouch: viewport.touch,
        isMobile: viewport.touch && viewport.width < 768,
      });
      const page = await context.newPage();
      const quality = observeRuntimeQuality(page);

      try {
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

        await testInfo.attach(`orha-authenticated-${viewport.name}`, {
          body: await page.screenshot({ fullPage: true }),
          contentType: "image/png",
        });
        quality.expectClean();
      } finally {
        await closeBrowserContexts([context]);
      }
    });
  }
});
