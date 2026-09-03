import {
  test,
  expect,
  expectBaselineAccessibility,
} from "./support/quality-gate";
import {
  authStatePath,
  currentAppPath,
  expectedSupabaseHost,
  requireNamedCredentials,
  openApp,
  openAppPath,
} from "./support/environment";

test.describe("navegação autenticada real", () => {
  test.use({ storageState: authStatePath("user-a") });

  test("restaura a sessão, consulta Supabase e percorre as cinco áreas", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    requireNamedCredentials("user-a");
    const successfulSupabaseResponses: string[] = [];
    page.on("response", (response) => {
      if (
        response.url().includes(expectedSupabaseHost()) &&
        response.status() >= 200 &&
        response.status() < 300
      ) {
        successfulSupabaseResponses.push(response.url());
      }
    });

    await openApp(page);
    const navigation = page.getByRole("navigation", {
      name: "Navegação principal",
    });
    await expect(navigation).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => successfulSupabaseResponses.length).toBeGreaterThan(0);

    const destinations = [
      { label: "Início", heading: /Seu lugar começa/, path: "/inicio" },
      { label: "Comunidade", heading: "Comunidade", path: "/comunidade" },
      { label: "Explorar", heading: "Explorar", path: "/explorar" },
      { label: "Conversas", heading: "Conversas", path: "/conversas" },
      { label: "Perfil", heading: "Perfil", path: "/perfil" },
    ] as const;

    for (const destination of destinations) {
      const tab = navigation.getByRole("button", { name: destination.label });
      await tab.click();
      await expect(tab).toHaveAttribute("aria-current", "page");
      await expect.poll(() => currentAppPath(page)).toBe(destination.path);
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: destination.heading,
        }),
      ).toBeVisible();
      await expectBaselineAccessibility(page);
    }

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("navigation", { name: "Navegação principal" }),
      "A sessão Supabase deve sobreviver ao reload.",
    ).toBeVisible({ timeout: 30_000 });

    await openAppPath(page, "/auth/login");
    await expect.poll(() => currentAppPath(page)).toBe("/inicio");
    await expect(
      page.getByRole("navigation", { name: "Navegação principal" }),
      "Uma sessão concluída não deve reabrir a rota pública de acesso.",
    ).toBeVisible({ timeout: 30_000 });
  });
});
