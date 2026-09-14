import { expect, test } from "playwright/test";
import type { Locator, Page } from "playwright/test";
import {
  authStatePath,
  openAppPath,
  requireNamedCredentials,
} from "./support/environment";
import { waitForAuthenticatedShell } from "./support/journey-ui";

async function expectFocusInside(dialog: Locator): Promise<void> {
  await expect
    .poll(() =>
      dialog.evaluate((element) => element.contains(document.activeElement)),
    )
    .toBe(true);
}

async function tabWithoutEscaping(
  page: Page,
  dialog: Locator,
  key: "Tab" | "Shift+Tab",
  repetitions: number,
): Promise<void> {
  for (let index = 0; index < repetitions; index += 1) {
    await page.keyboard.press(key);
    await expectFocusInside(dialog);
  }
}

test.describe("foco nativo dos Drawers GodUI", () => {
  test.use({ storageState: authStatePath("user-a") });

  test("retém o foco e o devolve ao acionador após Escape", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    requireNamedCredentials("user-a");
    await openAppPath(page, "/perfil");
    await waitForAuthenticatedShell(page);

    const editTrigger = page.getByRole("button", {
      name: "Editar dados do perfil",
    });
    await editTrigger.focus();
    await page.keyboard.press("Enter");

    const editDialog = page.getByRole("dialog", { name: "Editar perfil" });
    await expect(editDialog).toBeVisible();
    await expectFocusInside(editDialog);
    await tabWithoutEscaping(page, editDialog, "Tab", 12);
    await tabWithoutEscaping(page, editDialog, "Shift+Tab", 12);
    await page.keyboard.press("Escape");
    await expect(editDialog).toBeHidden();
    await expect(editTrigger).toBeFocused();

    const privacyTrigger = page.getByRole("button", {
      name: "Configurar privacidade do perfil",
    });
    await privacyTrigger.focus();
    await page.keyboard.press("Enter");

    const privacyDialog = page.getByRole("dialog", { name: "Privacidade" });
    await expect(privacyDialog).toBeVisible();
    await expectFocusInside(privacyDialog);
    await tabWithoutEscaping(page, privacyDialog, "Tab", 10);
    await page.keyboard.press("Escape");
    await expect(privacyDialog).toBeHidden();
    await expect(privacyTrigger).toBeFocused();
  });
});
