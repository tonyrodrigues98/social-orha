import { expect, type Page } from "playwright/test";
import type { NamedCredentials } from "./environment";

export async function waitForPublicAuth(page: Page): Promise<void> {
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toContainText("Você chegou à", { timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
}

export async function signInThroughPublicUi(
  page: Page,
  credentials: NamedCredentials,
  fallbackPasswords: readonly string[] = [],
): Promise<void> {
  await waitForPublicAuth(page);
  const authenticatedRoute = page.locator('[data-authenticated-route="true"]');
  const candidates = [credentials.password, ...fallbackPasswords]
    .filter((password, index, values) => Boolean(password) && values.indexOf(password) === index);

  for (const [index, password] of candidates.entries()) {
    await page.getByLabel("E-mail").fill(credentials.email);
    await page.getByLabel(/^Senha\b/).fill(password);
    await page.getByRole("button", { name: "Entrar" }).click();
    const authenticated = await authenticatedRoute
      .waitFor({ state: "attached", timeout: index === candidates.length - 1 ? 45_000 : 15_000 })
      .then(() => true)
      .catch(() => false);
    if (authenticated) return;
  }

  await expect(
    authenticatedRoute,
    "A conta E2E precisa existir no Supabase e ter o onboarding concluído.",
  ).toBeAttached({ timeout: 1_000 });
}
