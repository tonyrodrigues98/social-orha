import path from "node:path";
import { test, expect, type BrowserContext, type Page } from "playwright/test";
import { observeRuntimeQuality } from "./support/quality-gate";
import { withSupabaseFailureDiagnostics } from "./support/supabase-diagnostics";
import {
  createNamedBrowserContext,
  openAppPath,
  requireNamedCredentials,
} from "./support/environment";
import {
  closeBrowserContexts,
  expectPersonAbsentFromSearch,
  marker,
  openPersonFromSearch,
  runCleanupSteps,
  waitForAuthenticatedShell,
} from "./support/journey-ui";

type PrivacySnapshot = {
  profile: string;
  location: string;
  favorites: string;
  gallery: string;
  dating: boolean;
};

async function restoreBio(page: Page, originalBio: string): Promise<void> {
  await openAppPath(page, "/perfil");
  await waitForAuthenticatedShell(page);
  await page.getByRole("button", { name: "Editar dados do perfil" }).click();
  const dialog = page.getByRole("dialog", { name: "Editar perfil" });
  await dialog.getByLabel("Bio").fill(originalBio);
  await dialog.getByRole("button", { name: "Salvar perfil" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
}

async function restorePrivacy(
  page: Page,
  original: PrivacySnapshot,
): Promise<void> {
  await openAppPath(page, "/perfil");
  await waitForAuthenticatedShell(page);
  await page
    .getByRole("button", { name: "Configurar privacidade do perfil" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Privacidade" });
  await dialog.getByRole("combobox", { name: "Perfil", exact: true }).selectOption(original.profile);
  await dialog.getByRole("combobox", { name: "Localização", exact: true }).selectOption(original.location);
  await dialog.getByRole("combobox", { name: "Favoritos", exact: true }).selectOption(original.favorites);
  await dialog.getByRole("combobox", { name: "Galeria", exact: true }).selectOption(original.gallery);
  const datingToggle = dialog.getByRole("switch", { name: "Modo namoro" });
  if ((await datingToggle.isChecked()) !== original.dating) {
    await datingToggle.click();
  }
  await dialog.getByRole("button", { name: "Salvar privacidade" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
}

async function trimGalleryToCount(page: Page, baseline: number): Promise<void> {
  await openAppPath(page, "/perfil");
  await waitForAuthenticatedShell(page);
  const photos = page.getByRole("button", { name: /^Abrir foto \d+ de \d+$/ });
  if ((await photos.count()) <= baseline) return;

  const manage = page.getByRole("button", { name: "Gerenciar fotos da galeria" });
  await manage.click();
  while ((await photos.count()) > baseline) {
    const currentCount = await photos.count();
    await page
      .getByRole("button", {
        name: `Remover foto ${currentCount} da galeria`,
      })
      .click();
    await page
      .getByRole("dialog", { name: "Remover foto" })
      .getByRole("button", { name: "Remover foto" })
      .click();
    await expect.poll(() => photos.count(), { timeout: 30_000 }).toBe(currentCount - 1);
  }
}

test.describe("jornada E — perfil, upload e privacidade persistentes", () => {
  test("edita e restaura bio/privacidade e adiciona/remove foto real", async ({ browser }) => {
    test.setTimeout(300_000);
    const accountA = requireNamedCredentials("user-a");
    const accountB = requireNamedCredentials("user-b");
    const contexts: BrowserContext[] = await Promise.all([
      createNamedBrowserContext(browser, "user-a"),
      createNamedBrowserContext(browser, "user-b"),
    ]);
    const [contextA, contextB] = contexts;
    const [pageA, pageB] = await Promise.all([contextA.newPage(), contextB.newPage()]);
    const qualityA = observeRuntimeQuality(pageA);
    const qualityB = observeRuntimeQuality(pageB);
    const bioMarker = marker("bio-e2e");
    let originalBio: string | null = null;
    let originalPrivacy: PrivacySnapshot | null = null;
    let galleryBaseline: number | null = null;
    let bioNeedsRestore = false;
    let privacyNeedsRestore = false;
    let galleryNeedsRestore = false;

    try {
      await openAppPath(pageA, "/perfil");
      await waitForAuthenticatedShell(pageA);
      await pageA.getByRole("button", { name: "Editar dados do perfil" }).click();
      let editDialog = pageA.getByRole("dialog", { name: "Editar perfil" });
      const bio = editDialog.getByLabel("Bio");
      originalBio = await bio.inputValue();
      await bio.fill(bioMarker);
      bioNeedsRestore = true;
      await editDialog.getByRole("button", { name: "Salvar perfil" }).click();
      await expect(pageA.getByText(bioMarker)).toBeVisible({ timeout: 30_000 });

      await pageA.getByRole("button", { name: "Editar dados do perfil" }).click();
      editDialog = pageA.getByRole("dialog", { name: "Editar perfil" });
      await expect(editDialog.getByLabel("Bio")).toHaveValue(bioMarker);
      await editDialog.getByLabel("Bio").fill(originalBio);
      await editDialog.getByRole("button", { name: "Salvar perfil" }).click();
      await expect(pageA.getByText(bioMarker)).toHaveCount(0);
      bioNeedsRestore = false;

      const galleryPhotos = pageA.getByRole("button", { name: /^Abrir foto \d+ de \d+$/ });
      const photosBefore = await galleryPhotos.count();
      galleryBaseline = photosBefore;
      galleryNeedsRestore = true;
      await withSupabaseFailureDiagnostics(pageA, async () => {
        await pageA.getByLabel("Selecionar fotos para a galeria").setInputFiles(
          path.resolve("public/brand/orha-icon-192.png"),
        );
        await expect.poll(() => galleryPhotos.count(), { timeout: 45_000 }).toBe(photosBefore + 1);
      });
      await pageA.getByRole("button", { name: "Gerenciar fotos da galeria" }).click();
      await pageA
        .getByRole("button", { name: `Remover foto ${photosBefore + 1} da galeria` })
        .click();
      await pageA.getByRole("dialog", { name: "Remover foto" })
        .getByRole("button", { name: "Remover foto" })
        .click();
      await expect.poll(() => galleryPhotos.count(), { timeout: 30_000 }).toBe(photosBefore);
      galleryNeedsRestore = false;

      await pageA.getByRole("button", { name: "Configurar privacidade do perfil" }).click();
      let privacyDialog = pageA.getByRole("dialog", { name: "Privacidade" });
      originalPrivacy = {
        profile: await privacyDialog.getByRole("combobox", { name: "Perfil", exact: true }).inputValue(),
        location: await privacyDialog.getByRole("combobox", { name: "Localização", exact: true }).inputValue(),
        favorites: await privacyDialog.getByRole("combobox", { name: "Favoritos", exact: true }).inputValue(),
        gallery: await privacyDialog.getByRole("combobox", { name: "Galeria", exact: true }).inputValue(),
        dating: await privacyDialog.getByRole("switch", { name: "Modo namoro" }).isChecked(),
      };
      privacyNeedsRestore = true;
      await privacyDialog.getByRole("combobox", { name: "Perfil", exact: true }).selectOption("public");
      await privacyDialog.getByRole("button", { name: "Salvar privacidade" }).click();
      await expect(privacyDialog).toBeHidden({ timeout: 30_000 });

      await openPersonFromSearch(pageB, accountA.expectedProfileText!);
      await pageB.keyboard.press("Escape");
      await expect(
        pageB.getByRole("dialog", { name: "Conhecer pessoa" }),
      ).toBeHidden();

      await openAppPath(pageA, "/perfil");
      await pageA.getByRole("button", { name: "Configurar privacidade do perfil" }).click();
      privacyDialog = pageA.getByRole("dialog", { name: "Privacidade" });
      await privacyDialog.getByRole("combobox", { name: "Perfil", exact: true }).selectOption("private");
      await privacyDialog.getByRole("combobox", { name: "Localização", exact: true }).selectOption("private");
      await privacyDialog.getByRole("combobox", { name: "Galeria", exact: true }).selectOption("private");
      await privacyDialog.getByRole("button", { name: "Salvar privacidade" }).click();
      await expect(privacyDialog).toBeHidden({ timeout: 30_000 });

      await expectPersonAbsentFromSearch(pageB, accountA.expectedProfileText!);

      await openAppPath(pageA, "/perfil");
      await pageA.getByRole("button", { name: "Configurar privacidade do perfil" }).click();
      privacyDialog = pageA.getByRole("dialog", { name: "Privacidade" });
      await privacyDialog.getByRole("combobox", { name: "Perfil", exact: true }).selectOption(originalPrivacy.profile);
      await privacyDialog.getByRole("combobox", { name: "Localização", exact: true }).selectOption(originalPrivacy.location);
      await privacyDialog.getByRole("combobox", { name: "Favoritos", exact: true }).selectOption(originalPrivacy.favorites);
      await privacyDialog.getByRole("combobox", { name: "Galeria", exact: true }).selectOption(originalPrivacy.gallery);
      const datingToggle = privacyDialog.getByRole("switch", { name: "Modo namoro" });
      if ((await datingToggle.isChecked()) !== originalPrivacy.dating) await datingToggle.click();
      await privacyDialog.getByRole("button", { name: "Salvar privacidade" }).click();
      await expect(privacyDialog).toBeHidden({ timeout: 30_000 });

      await pageA.reload({ waitUntil: "domcontentloaded" });
      await pageA.getByRole("button", { name: "Configurar privacidade do perfil" }).click();
      privacyDialog = pageA.getByRole("dialog", { name: "Privacidade" });
      await expect(privacyDialog.getByRole("combobox", { name: "Perfil", exact: true })).toHaveValue(originalPrivacy.profile);
      await expect(privacyDialog.getByRole("combobox", { name: "Localização", exact: true })).toHaveValue(originalPrivacy.location);
      await expect(privacyDialog.getByRole("combobox", { name: "Galeria", exact: true })).toHaveValue(originalPrivacy.gallery);
      await privacyDialog.getByRole("button", { name: "Cancelar" }).click();
      privacyNeedsRestore = false;
      await expect(pageA.getByText(accountA.expectedProfileText!)).toBeVisible();
      await openAppPath(pageB, "/perfil");
      await expect(pageB.getByText(accountB.expectedProfileText!)).toBeVisible();

      qualityA.expectClean();
      qualityB.expectClean();
    } finally {
      await runCleanupSteps([
        {
          name: "restaurar bio da conta A",
          run:
            bioNeedsRestore && originalBio !== null
              ? () => restoreBio(pageA, originalBio!)
              : undefined,
        },
        {
          name: "remover uploads excedentes da galeria",
          run:
            galleryNeedsRestore && galleryBaseline !== null
              ? () => trimGalleryToCount(pageA, galleryBaseline!)
              : undefined,
        },
        {
          name: "restaurar privacidade da conta A",
          run:
            privacyNeedsRestore && originalPrivacy !== null
              ? () => restorePrivacy(pageA, originalPrivacy!)
              : undefined,
        },
        {
          name: "fechar contextos da jornada de perfil",
          run: () => closeBrowserContexts(contexts),
        },
      ]);
    }
  });
});
