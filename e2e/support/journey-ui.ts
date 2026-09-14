import { expect, type BrowserContext, type Page } from "playwright/test";
import { openAppPath } from "./environment";

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function marker(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export type CleanupStep = {
  name: string;
  run?: () => Promise<unknown>;
};

export async function runCleanupSteps(
  steps: readonly CleanupStep[],
): Promise<void> {
  const failures: Error[] = [];

  for (const step of steps) {
    if (!step.run) continue;
    try {
      await step.run();
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      failures.push(new Error(`${step.name}: ${detail}`, { cause }));
    }
  }

  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      `Falharam ${failures.length} etapas de limpeza E2E.`,
    );
  }
}

export async function closeBrowserContexts(
  contexts: readonly BrowserContext[],
): Promise<void> {
  const results = await Promise.allSettled(
    contexts.map((context) => context.close()),
  );
  const failures = results.flatMap((result) =>
    result.status === "rejected" ? [result.reason] : [],
  );
  if (failures.length > 0) {
    throw new AggregateError(failures, "Não foi possível fechar todos os contextos E2E.");
  }
}

export async function waitForAuthenticatedShell(page: Page): Promise<void> {
  await expect(
    page.getByRole("navigation", { name: "Navegação principal" }),
  ).toBeVisible({ timeout: 30_000 });
}

export async function openPersonFromSearch(
  page: Page,
  profileText: string,
): Promise<void> {
  await openAppPath(page, "/inicio");
  await waitForAuthenticatedShell(page);
  await page
    .getByRole("button", { name: "Pesquisar", exact: true })
    .click();
  const searchDialog = page.getByRole("dialog", { name: "Pesquisar" });
  await expect(searchDialog).toBeVisible();
  await searchDialog
    .getByLabel("Pesquisar pessoas, comunidades e interesses")
    .fill(profileText);
  const result = searchDialog.getByRole("button", {
    name: new RegExp(escapeRegExp(profileText), "i"),
  }).first();
  await expect(result).toBeVisible({ timeout: 30_000 });
  await result.click();
  await expect(
    page.getByRole("dialog", { name: "Conhecer pessoa" }),
  ).toBeVisible();
}

export async function openCommunityFromSearch(
  page: Page,
  communityName: string,
): Promise<void> {
  await openAppPath(page, "/inicio");
  await waitForAuthenticatedShell(page);
  await page
    .getByRole("button", { name: "Pesquisar", exact: true })
    .click();
  const searchDialog = page.getByRole("dialog", { name: "Pesquisar" });
  await searchDialog
    .getByLabel("Pesquisar pessoas, comunidades e interesses")
    .fill(communityName);
  const result = searchDialog.getByRole("button", {
    name: new RegExp(escapeRegExp(communityName), "i"),
  }).first();
  await expect(result).toBeVisible({ timeout: 30_000 });
  await result.click();
  await expect(page.getByRole("dialog", { name: "Comunidade" })).toBeVisible();
}

export async function expectPersonAbsentFromSearch(
  page: Page,
  profileText: string,
): Promise<void> {
  await openAppPath(page, "/inicio");
  await waitForAuthenticatedShell(page);
  await page
    .getByRole("button", { name: "Pesquisar", exact: true })
    .click();
  const searchDialog = page.getByRole("dialog", { name: "Pesquisar" });
  const profilesResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith(
        "/rest/v1/rpc/search_visible_profiles",
      ) && response.request().method() === "POST",
    { timeout: 30_000 },
  );
  await searchDialog
    .getByLabel("Pesquisar pessoas, comunidades e interesses")
    .fill(profileText);
  const response = await profilesResponse;
  expect(
    response.ok(),
    "A ausência só pode ser concluída depois que a busca real de perfis responder.",
  ).toBe(true);
  await expect(
    searchDialog.getByText("Pesquisando…", { exact: true }),
  ).toBeHidden({ timeout: 30_000 });
  await expect(
    searchDialog.getByRole("button", {
      name: new RegExp(escapeRegExp(profileText), "i"),
    }),
  ).toHaveCount(0);
}
