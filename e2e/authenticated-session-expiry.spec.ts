import { expect, test } from "playwright/test";
import { signInThroughPublicUi, waitForPublicAuth } from "./support/auth-ui";
import {
  createExpiredNamedBrowserContext,
  currentAppPath,
  openAppPath,
  requireNamedCredentials,
} from "./support/environment";
import {
  closeBrowserContexts,
  waitForAuthenticatedShell,
} from "./support/journey-ui";

test.describe("expiração real da sessão", () => {
  test("revoga o refresh token, volta ao login e recupera o destino protegido", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const credentials = requireNamedCredentials("user-a");
    const context = await createExpiredNamedBrowserContext(
      browser,
      "user-a",
    );
    const page = await context.newPage();
    const pageErrors: string[] = [];
    const refreshStatuses: number[] = [];

    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("response", (response) => {
      const url = new URL(response.url());
      if (
        url.pathname.endsWith("/auth/v1/token") &&
        url.searchParams.get("grant_type") === "refresh_token"
      ) {
        refreshStatuses.push(response.status());
      }
    });

    try {
      await openAppPath(page, "/inicio");
      await waitForPublicAuth(page);
      await expect.poll(() => currentAppPath(page)).toBe("/auth/login");
      expect(new URL(page.url()).searchParams.get("redirect")).toBe(
        "/inicio",
      );
      expect(
        refreshStatuses.some((status) => status === 400 || status === 401),
        "O Auth remoto precisa rejeitar o refresh token revogado.",
      ).toBe(true);

      await signInThroughPublicUi(page, credentials);
      await waitForAuthenticatedShell(page);
      await expect.poll(() => currentAppPath(page)).toBe("/inicio");

      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForAuthenticatedShell(page);
      await expect.poll(() => currentAppPath(page)).toBe("/inicio");
      expect(pageErrors).toEqual([]);
    } finally {
      await closeBrowserContexts([context]);
    }
  });
});
