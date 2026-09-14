import { test, expect, type BrowserContext, type Page } from "playwright/test";
import { observeRuntimeQuality } from "./support/quality-gate";
import {
  createNamedBrowserContext,
  openAppPath,
  requireNamedCredentials,
} from "./support/environment";
import {
  closeBrowserContexts,
  escapeRegExp,
  expectPersonAbsentFromSearch,
  marker,
  openPersonFromSearch,
  runCleanupSteps,
} from "./support/journey-ui";

async function unblockFromSettings(
  page: Page,
  profileText: string,
): Promise<boolean> {
  await openAppPath(page, "/configuracoes");
  await page.getByRole("button", { name: "Bloqueados" }).click();
  await expect(
    page.getByLabel("Carregando pessoas bloqueadas"),
  ).toBeHidden({ timeout: 30_000 });
  const profile = page.getByText(profileText, { exact: true }).first();
  if (!(await profile.isVisible().catch(() => false))) return false;

  const row = profile.locator("..").locator("..");
  await row.getByRole("button", { name: "Desbloquear" }).click();
  await expect(profile).toHaveCount(0, { timeout: 30_000 });
  return true;
}

async function dismissReport(
  page: Page,
  reportMarker: string,
): Promise<void> {
  await openAppPath(page, "/admin/moderacao");
  await expect(
    page.getByRole("heading", { level: 1, name: "Moderação" }),
  ).toBeVisible();
  await page.getByLabel("Estado da denúncia").selectOption("open");
  const reportCard = page.getByRole("button", {
    name: new RegExp(escapeRegExp(reportMarker), "i"),
  });
  await expect(reportCard).toBeVisible({ timeout: 30_000 });
  await reportCard.click();
  const actionRegion = page.getByRole("region", {
    name: "Aplicar ação de moderação",
  });
  await actionRegion.getByLabel("Ação").selectOption("dismiss");
  await actionRegion
    .getByLabel("Motivo obrigatório")
    .fill(`Validação automatizada ${reportMarker}; nenhum conteúdo real foi sancionado.`);
  await actionRegion.getByRole("button", { name: "Confirmar ação" }).click();
  await expect(reportCard).toHaveCount(0, { timeout: 30_000 });
}

test.describe("jornada F — bloqueio, denúncia e moderação real", () => {
  test("B bloqueia/desbloqueia A, denuncia e moderador encerra o caso", async ({ browser }) => {
    test.setTimeout(180_000);
    const accountA = requireNamedCredentials("user-a");
    const accountB = requireNamedCredentials("user-b");
    requireNamedCredentials("moderator");
    const reportMarker = marker("denúncia-e2e");
    const contexts: BrowserContext[] = await Promise.all([
      createNamedBrowserContext(browser, "user-a"),
      createNamedBrowserContext(browser, "user-b"),
      createNamedBrowserContext(browser, "moderator"),
    ]);
    const [contextA, contextB, contextModerator] = contexts;
    const [pageA, pageB, pageModerator] = await Promise.all([
      contextA.newPage(),
      contextB.newPage(),
      contextModerator.newPage(),
    ]);
    const qualityA = observeRuntimeQuality(pageA);
    const qualityB = observeRuntimeQuality(pageB);
    const qualityModerator = observeRuntimeQuality(pageModerator);
    let blockNeedsCleanup = false;
    let reportNeedsCleanup = false;

    try {
      await unblockFromSettings(pageB, accountA.expectedProfileText!);

      await openPersonFromSearch(pageA, accountB.expectedProfileText!);
      await pageA.keyboard.press("Escape");
      await expect(
        pageA.getByRole("dialog", { name: "Conhecer pessoa" }),
      ).toBeHidden();

      await openPersonFromSearch(pageB, accountA.expectedProfileText!);
      let personDialog = pageB.getByRole("dialog", { name: "Conhecer pessoa" });
      if (await personDialog.getByRole("button", { name: "Desbloquear perfil" }).isVisible().catch(() => false)) {
        await personDialog.getByRole("button", { name: "Desbloquear perfil" }).click();
        await openPersonFromSearch(pageB, accountA.expectedProfileText!);
        personDialog = pageB.getByRole("dialog", { name: "Conhecer pessoa" });
      }
      await personDialog.getByRole("button", { name: "Bloquear perfil" }).click();
      blockNeedsCleanup = true;
      await personDialog.getByRole("button", { name: "Confirmar bloqueio" }).click();
      await expect(pageB.getByRole("status").filter({ hasText: "foi bloqueado" })).toBeVisible();

      await openAppPath(pageB, "/configuracoes");
      await pageB.getByRole("button", { name: "Bloqueados" }).click();
      await expect(pageB.getByText(accountA.expectedProfileText!)).toBeVisible({ timeout: 30_000 });

      await expectPersonAbsentFromSearch(pageA, accountB.expectedProfileText!);

      expect(await unblockFromSettings(pageB, accountA.expectedProfileText!)).toBe(true);
      blockNeedsCleanup = false;

      await openPersonFromSearch(pageB, accountA.expectedProfileText!);
      personDialog = pageB.getByRole("dialog", { name: "Conhecer pessoa" });
      await personDialog.getByRole("button", { name: "Denunciar perfil" }).click();
      await expect(pageB.getByRole("heading", { level: 1, name: "Fazer denúncia" })).toBeVisible();
      await pageB.getByLabel("Motivo").selectOption("other");
      await pageB.getByLabel("O que aconteceu? (opcional)").fill(reportMarker);
      await pageB.getByRole("button", { name: "Enviar denúncia" }).click();
      await expect(pageB.getByRole("heading", { level: 1, name: "Fazer denúncia" })).toHaveCount(0, { timeout: 30_000 });
      reportNeedsCleanup = true;

      await dismissReport(pageModerator, reportMarker);
      reportNeedsCleanup = false;

      qualityA.expectClean();
      qualityB.expectClean();
      qualityModerator.expectClean();
    } finally {
      await runCleanupSteps([
        {
          name: "desbloquear a conta A",
          run: blockNeedsCleanup
            ? () => unblockFromSettings(pageB, accountA.expectedProfileText!)
            : undefined,
        },
        {
          name: "encerrar denúncia E2E",
          run: reportNeedsCleanup
            ? () => dismissReport(pageModerator, reportMarker)
            : undefined,
        },
        {
          name: "fechar contextos da jornada de confiança",
          run: () => closeBrowserContexts(contexts),
        },
      ]);
    }
  });
});
