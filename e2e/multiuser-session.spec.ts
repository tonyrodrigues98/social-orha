import { test, expect } from "playwright/test";
import { observeRuntimeQuality } from "./support/quality-gate";
import {
  createNamedBrowserContext,
  openAppPath,
  requireNamedCredentials,
  openApp,
  readSupabaseSessionSubject,
} from "./support/environment";

test.describe("isolamento de sessão multiusuário", () => {
  test("abre duas contas Supabase distintas em contextos isolados", async ({
    browser,
  }) => {
    const credentialsA = requireNamedCredentials("user-a");
    const credentialsB = requireNamedCredentials("user-b");
    const [contextA, contextB] = await Promise.all([
      createNamedBrowserContext(browser, "user-a"),
      createNamedBrowserContext(browser, "user-b"),
    ]);

    try {
      const [pageA, pageB] = await Promise.all([
        contextA.newPage(),
        contextB.newPage(),
      ]);
      const qualityA = observeRuntimeQuality(pageA);
      const qualityB = observeRuntimeQuality(pageB);
      await Promise.all([openApp(pageA), openApp(pageB)]);

      await Promise.all([
        expect(
          pageA.getByRole("navigation", { name: "Navegação principal" }),
        ).toBeVisible({ timeout: 30_000 }),
        expect(
          pageB.getByRole("navigation", { name: "Navegação principal" }),
        ).toBeVisible({ timeout: 30_000 }),
      ]);

      const [stateA, stateB] = await Promise.all([
        contextA.storageState(),
        contextB.storageState(),
      ]);
      const subjectA = readSupabaseSessionSubject(stateA);
      const subjectB = readSupabaseSessionSubject(stateB);
      expect(
        {
          userAHasRealSession: Boolean(subjectA),
          userBHasRealSession: Boolean(subjectB),
          sessionsAreDistinct: Boolean(subjectA && subjectB && subjectA !== subjectB),
        },
        "Os dois contextos precisam conter sessões reais e distintas.",
      ).toEqual({
        userAHasRealSession: true,
        userBHasRealSession: true,
        sessionsAreDistinct: true,
      });

      await Promise.all([openAppPath(pageA, "/perfil"), openAppPath(pageB, "/perfil")]);
      await expect(pageA.getByText(credentialsA.expectedProfileText!)).toBeVisible();
      await expect(pageB.getByText(credentialsB.expectedProfileText!)).toBeVisible();
      qualityA.expectClean();
      qualityB.expectClean();
    } finally {
      await Promise.all([contextA.close(), contextB.close()]);
    }
  });
});
