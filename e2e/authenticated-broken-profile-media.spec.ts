import { randomUUID } from "node:crypto";
import { expect, test } from "playwright/test";
import {
  createNamedBrowserContext,
  openAppPath,
  readSupabaseSessionSubject,
} from "./support/environment";
import {
  closeBrowserContexts,
  waitForAuthenticatedShell,
} from "./support/journey-ui";
import { createE2EAdminClient } from "./support/supabase-admin";

test.describe("mídia privada indisponível", () => {
  test("substitui imagem ausente por fallback acionável sem ícone quebrado", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const context = await createNamedBrowserContext(browser, "user-a");
    const state = await context.storageState();
    const profileId = readSupabaseSessionSubject(state);
    if (!profileId) throw new Error("A sessão E2E não possui subject.");

    const admin = createE2EAdminClient();
    const mediaId = randomUUID();
    const objectPath = `${profileId}/gallery/${randomUUID()}.webp`;
    const inserted = await admin.from("profile_media").insert({
      id: mediaId,
      profile_id: profileId,
      purpose: "gallery",
      bucket_id: "profile-media",
      object_path: objectPath,
      mime_type: "image/webp",
      byte_size: 128,
      width: 320,
      height: 320,
      sort_order: 8,
      status: "ready",
    });
    if (inserted.error) {
      await closeBrowserContexts([context]);
      throw new Error("Não foi possível preparar a mídia ausente efêmera.");
    }

    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    let journeyError: unknown = null;
    try {
      await openAppPath(page, "/perfil");
      await waitForAuthenticatedShell(page);
      await expect(
        page.getByRole("img", { name: "Foto 1 indisponível" }),
      ).toBeVisible({ timeout: 30_000 });
      await expect(
        page.getByRole("button", {
          name: "Tentar carregar novamente a foto 1",
        }),
      ).toBeVisible();
      await expect(page.locator("img.gallery-image:visible")).toHaveCount(0);
      expect(pageErrors).toEqual([]);
    } catch (error) {
      journeyError = error;
    }

    const removed = await admin
      .from("profile_media")
      .delete()
      .eq("id", mediaId)
      .eq("profile_id", profileId);
    await closeBrowserContexts([context]);
    if (removed.error) {
      throw new Error("A mídia ausente efêmera não foi removida.");
    }
    if (journeyError) throw journeyError;
  });
});
