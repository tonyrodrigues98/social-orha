import { test, expect, type BrowserContext, type Locator, type Page } from "playwright/test";
import { observeRuntimeQuality } from "./support/quality-gate";
import {
  createNamedBrowserContext,
  requireNamedCredentials,
} from "./support/environment";
import { openPersonFromSearch } from "./support/journey-ui";

async function clickWhenVisible(locator: Locator): Promise<boolean> {
  if (!(await locator.isVisible().catch(() => false))) return false;
  await locator.click();
  return true;
}

async function openRelationship(page: Page, profileText: string): Promise<Locator> {
  await openPersonFromSearch(page, profileText);
  let dialog = page.getByRole("dialog", { name: "Conhecer pessoa" });
  if (await clickWhenVisible(dialog.getByRole("button", { name: "Desbloquear perfil" }))) {
    await openPersonFromSearch(page, profileText);
    dialog = page.getByRole("dialog", { name: "Conhecer pessoa" });
  }
  return dialog;
}

async function restoreNoFriendship(
  pageA: Page,
  profileTextB: string,
  pageB: Page,
  profileTextA: string,
): Promise<void> {
  let dialogA = await openRelationship(pageA, profileTextB);
  if (await clickWhenVisible(dialogA.getByRole("button", { name: "Remover amizade" }))) {
    await expect(dialogA.getByRole("button", { name: "Enviar solicitação de amizade" })).toBeVisible();
    return;
  }
  if (await clickWhenVisible(dialogA.getByRole("button", { name: "Recusar" }))) {
    await expect(dialogA.getByRole("button", { name: "Enviar solicitação de amizade" })).toBeVisible();
    return;
  }
  const outgoingFromA = await dialogA
    .getByRole("button", { name: "Solicitação enviada" })
    .isVisible()
    .catch(() => false);
  if (!outgoingFromA) return;

  const dialogB = await openRelationship(pageB, profileTextA);
  if (await clickWhenVisible(dialogB.getByRole("button", { name: "Aceitar solicitação" }))) {
    await expect(dialogB.getByRole("button", { name: "Remover amizade" })).toBeVisible();
  }
  if (await clickWhenVisible(dialogB.getByRole("button", { name: "Remover amizade" }))) {
    await expect(dialogB.getByRole("button", { name: "Enviar solicitação de amizade" })).toBeVisible();
    return;
  }

  dialogA = await openRelationship(pageA, profileTextB);
  await expect(dialogA.getByRole("button", { name: "Enviar solicitação de amizade" })).toBeVisible();
}

async function closeContexts(contexts: BrowserContext[]): Promise<void> {
  await Promise.all(contexts.map((context) => context.close()));
}

test.describe("jornada B — amizade real entre duas contas", () => {
  test("A solicita, B aceita, ambos observam e A remove a amizade", async ({ browser }) => {
    test.setTimeout(120_000);
    const accountA = requireNamedCredentials("user-a");
    const accountB = requireNamedCredentials("user-b");
    const contexts = await Promise.all([
      createNamedBrowserContext(browser, "user-a"),
      createNamedBrowserContext(browser, "user-b"),
    ]);
    const [contextA, contextB] = contexts;
    const [pageA, pageB] = await Promise.all([contextA.newPage(), contextB.newPage()]);
    const qualityA = observeRuntimeQuality(pageA);
    const qualityB = observeRuntimeQuality(pageB);
    let friendshipMayNeedCleanup = false;

    try {
      await restoreNoFriendship(
        pageA,
        accountB.expectedProfileText!,
        pageB,
        accountA.expectedProfileText!,
      );
      let dialogA = pageA.getByRole("dialog", { name: "Conhecer pessoa" });
      const sentAlready = await dialogA
        .getByRole("button", { name: "Solicitação enviada" })
        .isVisible()
        .catch(() => false);
      friendshipMayNeedCleanup = true;
      if (!sentAlready) {
        await dialogA
          .getByRole("button", { name: "Enviar solicitação de amizade" })
          .click();
        await expect(dialogA.getByRole("button", { name: "Solicitação enviada" })).toBeVisible();
      }

      await openPersonFromSearch(pageB, accountA.expectedProfileText!);
      const dialogB = pageB.getByRole("dialog", { name: "Conhecer pessoa" });
      await expect(dialogB.getByRole("button", { name: "Aceitar solicitação" })).toBeVisible({ timeout: 30_000 });
      await dialogB.getByRole("button", { name: "Aceitar solicitação" }).click();
      await expect(dialogB.getByRole("button", { name: "Remover amizade" })).toBeVisible();

      await openPersonFromSearch(pageA, accountB.expectedProfileText!);
      dialogA = pageA.getByRole("dialog", { name: "Conhecer pessoa" });
      await expect(dialogA.getByRole("button", { name: "Remover amizade" })).toBeVisible({ timeout: 30_000 });
      await dialogA.getByRole("button", { name: "Remover amizade" }).click();
      await expect(dialogA.getByRole("button", { name: "Enviar solicitação de amizade" })).toBeVisible();
      friendshipMayNeedCleanup = false;

      qualityA.expectClean();
      qualityB.expectClean();
    } finally {
      if (friendshipMayNeedCleanup) {
        await restoreNoFriendship(
          pageA,
          accountB.expectedProfileText!,
          pageB,
          accountA.expectedProfileText!,
        );
      }
      await closeContexts(contexts);
    }
  });
});
