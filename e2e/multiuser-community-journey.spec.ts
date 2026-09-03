import {
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
} from "playwright/test";
import { observeRuntimeQuality } from "./support/quality-gate";
import {
  createNamedBrowserContext,
  currentAppPath,
  openAppPath,
  requireNamedCredentials,
} from "./support/environment";
import {
  closeBrowserContexts,
  marker,
  runCleanupSteps,
  waitForAuthenticatedShell,
} from "./support/journey-ui";

const COMMUNITY_PATH = /^\/comunidade\/[0-9a-f-]{36}$/i;

function postByText(page: Page, postText: string): Locator {
  return page
    .locator('[data-testid^="community-post-"]')
    .filter({ hasText: postText })
    .first();
}

async function openCommunity(
  page: Page,
  communityPath: string,
  communityName: string,
): Promise<void> {
  await openAppPath(page, communityPath);
  await waitForAuthenticatedShell(page);
  await expect(
    page.getByRole("heading", { level: 1, name: communityName }),
  ).toBeVisible({ timeout: 30_000 });
}

async function leaveCommunityIfNeeded(
  page: Page,
  communityPath: string,
  communityName: string,
): Promise<void> {
  await openCommunity(page, communityPath, communityName);
  const leave = page.getByRole("button", { name: "Sair da comunidade" });
  if (!(await leave.isVisible().catch(() => false))) return;
  await leave.click();
  await expect(
    page.getByRole("button", { name: "Entrar na comunidade" }),
  ).toBeVisible({ timeout: 30_000 });
}

async function deletePostIfPresent(
  page: Page,
  communityPath: string,
  communityName: string,
  postText: string,
): Promise<void> {
  await openCommunity(page, communityPath, communityName);
  const post = postByText(page, postText);
  if (!(await post.isVisible().catch(() => false))) return;
  await post.getByRole("button", { name: "Excluir publicação" }).click();
  const confirmation = post.getByRole("alertdialog", {
    name: "Confirmar exclusão da publicação",
  });
  await confirmation.getByRole("button", { name: "Excluir", exact: true }).click();
  await expect(post).toHaveCount(0, { timeout: 30_000 });
}

async function archiveCommunity(
  page: Page,
  communityPath: string,
  communityName: string,
): Promise<void> {
  await openCommunity(page, communityPath, communityName);
  await page.getByRole("button", { name: "Administrar comunidade" }).click();
  const manager = page.getByRole("dialog", { name: "Administrar comunidade" });
  await manager.getByTestId("archive-community").click();
  await manager.getByTestId("archive-community-confirm").click();
  await expect.poll(() => currentAppPath(page), { timeout: 30_000 }).toBe(
    "/comunidade",
  );
}

test.describe("jornada C — comunidade, publicação, comentário e reação", () => {
  test("A cria conteúdo, B participa e tudo persiste antes da limpeza real", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    requireNamedCredentials("user-a");
    requireNamedCredentials("user-b");
    const communityName = marker("ORHA E2E comunidade");
    const postText = marker("Publicação E2E");
    const commentText = marker("Comentário E2E");
    const contexts: BrowserContext[] = await Promise.all([
      createNamedBrowserContext(browser, "user-a"),
      createNamedBrowserContext(browser, "user-b"),
    ]);
    const [contextA, contextB] = contexts;
    const [pageA, pageB] = await Promise.all([
      contextA.newPage(),
      contextB.newPage(),
    ]);
    const qualityA = observeRuntimeQuality(pageA);
    const qualityB = observeRuntimeQuality(pageB);
    let communityPath: string | null = null;
    let communityNeedsArchive = false;
    let postNeedsDelete = false;
    let membershipNeedsLeave = false;

    try {
      await openAppPath(pageA, "/comunidade");
      await waitForAuthenticatedShell(pageA);
      await pageA.getByRole("button", { name: "Criar comunidade" }).click();
      const createCommunity = pageA.getByRole("dialog", {
        name: "Criar comunidade",
      });
      await createCommunity.getByLabel("Nome da comunidade").fill(communityName);
      await createCommunity
        .getByLabel("Sobre o que vocês vão conversar?")
        .fill("Espaço descartável de validação E2E do ORHA.");
      await createCommunity.getByLabel("Quem pode entrar").selectOption("public");
      await createCommunity
        .getByRole("button", { name: "Criar comunidade" })
        .click();
      await expect
        .poll(() => currentAppPath(pageA), { timeout: 30_000 })
        .toMatch(COMMUNITY_PATH);
      communityPath = currentAppPath(pageA);
      communityNeedsArchive = true;
      await expect(
        pageA.getByRole("heading", { level: 1, name: communityName }),
      ).toBeVisible({ timeout: 30_000 });

      await pageA.getByLabel("Texto da publicação").fill(postText);
      postNeedsDelete = true;
      await pageA.getByRole("button", { name: "Publicar", exact: true }).click();
      await expect(
        pageA.getByRole("status").filter({ hasText: "Publicação criada" }),
      ).toBeVisible({ timeout: 30_000 });
      const ownerPost = postByText(pageA, postText);
      await expect(ownerPost).toBeVisible({ timeout: 30_000 });
      const postTestId = await ownerPost.getAttribute("data-testid");
      const postId = postTestId?.replace(/^community-post-/, "");
      expect(postId).toMatch(/^[0-9a-f-]{36}$/i);

      await openCommunity(pageB, communityPath, communityName);
      await pageB.getByRole("button", { name: "Entrar na comunidade" }).click();
      membershipNeedsLeave = true;
      await expect(
        pageB.getByRole("button", { name: "Sair da comunidade" }),
      ).toBeVisible({ timeout: 30_000 });

      let memberPost = postByText(pageB, postText);
      await expect(memberPost).toBeVisible({ timeout: 30_000 });
      const amen = pageB.getByTestId(`community-post-reaction-amen-${postId}`);
      await amen.click();
      await expect(amen).toHaveAttribute("aria-pressed", "true");

      await pageB.getByTestId(`community-post-comments-${postId}`).click();
      let thread = pageB.getByRole("dialog", {
        name: "Conversa da publicação",
      });
      await thread.getByLabel("Texto do comentário").fill(commentText);
      await thread.getByRole("button", { name: "Comentar" }).click();
      await expect(thread.getByText(commentText)).toBeVisible({ timeout: 30_000 });

      await pageB.keyboard.press("Escape");
      await expect(thread).toBeHidden();
      await pageB.reload({ waitUntil: "domcontentloaded" });
      await waitForAuthenticatedShell(pageB);
      memberPost = postByText(pageB, postText);
      await expect(memberPost).toBeVisible({ timeout: 30_000 });
      await expect(
        pageB.getByTestId(`community-post-reaction-amen-${postId}`),
      ).toHaveAttribute("aria-pressed", "true");
      await pageB.getByTestId(`community-post-comments-${postId}`).click();
      thread = pageB.getByRole("dialog", { name: "Conversa da publicação" });
      await expect(thread.getByText(commentText)).toBeVisible({ timeout: 30_000 });
      await pageB.keyboard.press("Escape");

      await leaveCommunityIfNeeded(pageB, communityPath, communityName);
      membershipNeedsLeave = false;
      await deletePostIfPresent(pageA, communityPath, communityName, postText);
      postNeedsDelete = false;
      await archiveCommunity(pageA, communityPath, communityName);
      communityNeedsArchive = false;

      qualityA.expectClean();
      qualityB.expectClean();
    } finally {
      await runCleanupSteps([
        {
          name: "remover associação da conta B à comunidade",
          run:
            membershipNeedsLeave && communityPath
              ? () => leaveCommunityIfNeeded(pageB, communityPath!, communityName)
              : undefined,
        },
        {
          name: "excluir publicação E2E",
          run:
            postNeedsDelete && communityPath
              ? () => deletePostIfPresent(pageA, communityPath!, communityName, postText)
              : undefined,
        },
        {
          name: "arquivar comunidade E2E",
          run:
            communityNeedsArchive && communityPath
              ? () => archiveCommunity(pageA, communityPath!, communityName)
              : undefined,
        },
        {
          name: "fechar contextos da jornada de comunidade",
          run: () => closeBrowserContexts(contexts),
        },
      ]);
    }
  });
});
