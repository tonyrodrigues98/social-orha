import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
} from "playwright/test";
import { validateSocialSmokeTarget } from "../scripts/social-domain-smoke-target";
import { signInThroughPublicUi } from "./support/auth-ui";
import {
  createAnonymousBrowserContext,
  openApp,
  openAppPath,
} from "./support/environment";
import {
  closeBrowserContexts,
  marker,
  openPersonFromSearch,
  waitForAuthenticatedShell,
} from "./support/journey-ui";
import { observeRuntimeQuality } from "./support/quality-gate";

type EphemeralPrincipal = {
  id: string;
  email: string;
  password: string;
  username: string;
  fullName: string;
};

const principals: EphemeralPrincipal[] = [];
let admin: SupabaseClient;

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required staging environment: ${name}.`);
  return value;
}

function rpcRow(value: unknown): Record<string, unknown> {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return {};
  return row as Record<string, unknown>;
}

async function createPrincipal(label: "a" | "b"): Promise<EphemeralPrincipal> {
  const unique = randomUUID();
  const email = `orha-browser-smoke-${label}-${unique}@example.invalid`;
  const password = `Orha-Browser-${unique}!`;
  const username = `browser_${label}_${unique.replaceAll("-", "").slice(0, 16)}`;
  const fullName = `ORHA Browser Smoke ${label.toUpperCase()}`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { test_scope: "staging-social-browser-smoke" },
  });
  if (created.error || !created.data.user) {
    throw new Error("Could not create the ephemeral browser-smoke account.");
  }

  const stagingUrl = requiredEnvironment("ORHA_STAGING_SUPABASE_URL");
  const publishableKey = requiredEnvironment(
    "ORHA_STAGING_SUPABASE_PUBLISHABLE_KEY",
  );
  const userClient = createClient(stagingUrl, publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const signedIn = await userClient.auth.signInWithPassword({
    email,
    password,
  });
  if (signedIn.error || !signedIn.data.session) {
    await admin.auth.admin.deleteUser(created.data.user.id, false);
    throw new Error(
      "The ephemeral browser-smoke account could not authenticate.",
    );
  }
  const prepared = await admin
    .from("profiles")
    .update({
      full_name: fullName,
      username,
      birth_date: "1990-01-01",
      state_code: "SP",
      city: "São Paulo",
      bio: "Perfil efêmero para validação real pelo navegador.",
      onboarding_step: 5,
    })
    .eq("id", created.data.user.id)
    .select("id")
    .single();
  if (prepared.error) {
    await admin.auth.admin.deleteUser(created.data.user.id, false);
    throw new Error("Could not prepare the ephemeral browser-smoke profile.");
  }
  const completed = await userClient.rpc("complete_own_onboarding");
  if (completed.error || rpcRow(completed.data).id !== created.data.user.id) {
    await admin.auth.admin.deleteUser(created.data.user.id, false);
    throw new Error("Could not complete ephemeral browser-smoke onboarding.");
  }
  await userClient.auth.signOut();
  return { id: created.data.user.id, email, password, username, fullName };
}

async function authenticatedPage(
  browserContext: BrowserContext,
  principal: EphemeralPrincipal,
): Promise<Page> {
  const page = await browserContext.newPage();
  await openApp(page);
  await signInThroughPublicUi(page, {
    email: principal.email,
    password: principal.password,
    expectedProfileText: principal.username,
  });
  return page;
}

function postByText(page: Page, text: string): Locator {
  return page
    .locator('[data-testid^="community-post-"]')
    .filter({ hasText: text })
    .first();
}

test.describe("staging social browser smoke", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    const stagingUrl = requiredEnvironment("ORHA_STAGING_SUPABASE_URL");
    const linkedRef = await readFile(
      path.resolve("supabase", ".temp", "project-ref"),
      "utf8",
    );
    validateSocialSmokeTarget(stagingUrl, linkedRef);
    const serviceRoleKey = requiredEnvironment("ORHA_E2E_SERVICE_ROLE_KEY");
    admin = createClient(stagingUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });
    principals.push(await createPrincipal("a"));
    principals.push(await createPrincipal("b"));
  });

  test.afterAll(async () => {
    const principalIds = principals.map((principal) => principal.id);
    if (principalIds.length) {
      const communities = await admin
        .from("communities")
        .delete()
        .in("owner_id", principalIds);
      if (communities.error) {
        throw new Error("Could not clean browser-smoke communities.");
      }
    }
    for (const principal of principals) {
      const existing = await admin.auth.admin.getUserById(principal.id);
      if (existing.data.user) {
        const deleted = await admin.auth.admin.deleteUser(principal.id, false);
        if (deleted.error) {
          throw new Error(
            "Could not clean an ephemeral browser-smoke account.",
          );
        }
      }
    }
    if (principalIds.length) {
      const remaining = await admin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .in("id", principalIds);
      if (remaining.error || remaining.count !== 0) {
        throw new Error(
          "Ephemeral browser-smoke profiles remained after cleanup.",
        );
      }
    }
  });

  test("friendship works through two independent browser sessions", async ({
    browser,
  }) => {
    test.setTimeout(150_000);
    const [principalA, principalB] = principals;
    if (!principalA || !principalB)
      throw new Error("Ephemeral principals missing.");
    const contexts = await Promise.all([
      createAnonymousBrowserContext(browser),
      createAnonymousBrowserContext(browser),
    ]);
    const [contextA, contextB] = contexts;
    const [pageA, pageB] = await Promise.all([
      authenticatedPage(contextA, principalA),
      authenticatedPage(contextB, principalB),
    ]);
    const qualityA = observeRuntimeQuality(pageA);
    const qualityB = observeRuntimeQuality(pageB);

    try {
      await openPersonFromSearch(pageA, principalB.fullName);
      let relationshipA = pageA.getByRole("dialog", {
        name: "Conhecer pessoa",
      });
      await relationshipA
        .getByRole("button", { name: "Enviar solicitação de amizade" })
        .click();
      await expect(
        relationshipA.getByRole("button", { name: "Solicitação enviada" }),
      ).toBeVisible({ timeout: 30_000 });

      await openPersonFromSearch(pageB, principalA.fullName);
      const relationshipB = pageB.getByRole("dialog", {
        name: "Conhecer pessoa",
      });
      await expect(
        relationshipB.getByRole("button", { name: "Aceitar solicitação" }),
      ).toBeVisible({ timeout: 30_000 });
      await relationshipB
        .getByRole("button", { name: "Aceitar solicitação" })
        .click();
      await expect(
        relationshipB.getByRole("button", { name: "Remover amizade" }),
      ).toBeVisible({ timeout: 30_000 });

      await openPersonFromSearch(pageA, principalB.fullName);
      relationshipA = pageA.getByRole("dialog", { name: "Conhecer pessoa" });
      await expect(
        relationshipA.getByRole("button", { name: "Remover amizade" }),
      ).toBeVisible({ timeout: 30_000 });
      await relationshipA
        .getByRole("button", { name: "Remover amizade" })
        .click();
      await expect(
        relationshipA.getByRole("button", {
          name: "Enviar solicitação de amizade",
        }),
      ).toBeVisible({ timeout: 30_000 });

      qualityA.expectClean();
      qualityB.expectClean();
    } finally {
      await closeBrowserContexts(contexts);
    }
  });

  test("community, post, reaction and comment survive a reload", async ({
    browser,
  }) => {
    test.setTimeout(210_000);
    const [principalA, principalB] = principals;
    if (!principalA || !principalB)
      throw new Error("Ephemeral principals missing.");
    const contexts = await Promise.all([
      createAnonymousBrowserContext(browser),
      createAnonymousBrowserContext(browser),
    ]);
    const [contextA, contextB] = contexts;
    const [pageA, pageB] = await Promise.all([
      authenticatedPage(contextA, principalA),
      authenticatedPage(contextB, principalB),
    ]);
    const qualityA = observeRuntimeQuality(pageA);
    const qualityB = observeRuntimeQuality(pageB);
    const communityName = marker("ORHA Browser Smoke");
    const postText = marker("Publicação Browser Smoke");
    const commentText = marker("Comentário Browser Smoke");

    try {
      await openAppPath(pageA, "/comunidade");
      await waitForAuthenticatedShell(pageA);
      await pageA.getByRole("button", { name: "Criar comunidade" }).click();
      const createCommunity = pageA.getByRole("dialog", {
        name: "Criar comunidade",
      });
      await createCommunity
        .getByLabel("Nome da comunidade")
        .fill(communityName);
      await createCommunity
        .getByLabel("Sobre o que vocês vão conversar?")
        .fill("Espaço efêmero de validação real pelo navegador.");
      await createCommunity
        .getByLabel("Quem pode entrar")
        .selectOption("public");
      await createCommunity
        .getByRole("button", { name: "Criar comunidade" })
        .click();
      await expect(
        pageA.getByRole("heading", { level: 1, name: communityName }),
      ).toBeVisible({ timeout: 30_000 });
      const communityPath = new URL(pageA.url()).pathname;
      expect(communityPath).toMatch(/\/comunidade\/[0-9a-f-]{36}$/i);

      await pageA.getByLabel("Texto da publicação").fill(postText);
      await pageA
        .getByRole("button", { name: "Publicar", exact: true })
        .click();
      const ownerPost = postByText(pageA, postText);
      await expect(ownerPost).toBeVisible({ timeout: 30_000 });
      const postId = (await ownerPost.getAttribute("data-testid"))?.replace(
        /^community-post-/,
        "",
      );
      expect(postId).toMatch(/^[0-9a-f-]{36}$/i);

      await openAppPath(pageB, communityPath);
      await expect(
        pageB.getByRole("heading", { level: 1, name: communityName }),
      ).toBeVisible({ timeout: 30_000 });
      await pageB.getByRole("button", { name: "Entrar na comunidade" }).click();
      await expect(
        pageB.getByRole("button", { name: "Sair da comunidade" }),
      ).toBeVisible({ timeout: 30_000 });
      await expect(postByText(pageB, postText)).toBeVisible({
        timeout: 30_000,
      });

      const amen = pageB.getByTestId(`community-post-reaction-amen-${postId}`);
      await amen.click();
      await expect(amen).toHaveAttribute("aria-pressed", "true");
      await pageB.getByTestId(`community-post-comments-${postId}`).click();
      let thread = pageB.getByRole("dialog", {
        name: "Conversa da publicação",
      });
      await thread.getByLabel("Texto do comentário").fill(commentText);
      await thread.getByRole("button", { name: "Comentar" }).click();
      await expect(thread.getByRole("status")).toHaveText(
        "Comentário publicado.",
        { timeout: 30_000 },
      );
      await expect(
        thread.locator("article").filter({ hasText: commentText }),
      ).toBeVisible({
        timeout: 30_000,
      });
      await expect(thread.getByLabel("Texto do comentário")).toBeEnabled({
        timeout: 30_000,
      });

      await pageB.goBack({ waitUntil: "domcontentloaded" });
      await expect(thread).toBeHidden({ timeout: 30_000 });
      await expect(pageB).toHaveURL((url) => url.pathname === communityPath, {
        timeout: 30_000,
      });
      await pageB.reload({ waitUntil: "domcontentloaded" });
      await expect(
        pageB.getByRole("heading", { level: 1, name: communityName }),
      ).toBeVisible({ timeout: 30_000 });
      await expect(postByText(pageB, postText)).toBeVisible({
        timeout: 30_000,
      });
      await expect(
        pageB.getByTestId(`community-post-reaction-amen-${postId}`),
      ).toHaveAttribute("aria-pressed", "true");
      await pageB.getByTestId(`community-post-comments-${postId}`).click();
      thread = pageB.getByRole("dialog", { name: "Conversa da publicação" });
      await expect(
        thread.locator("article").filter({ hasText: commentText }),
      ).toBeVisible({
        timeout: 30_000,
      });

      qualityA.expectClean();
      qualityB.expectClean();
    } finally {
      await closeBrowserContexts(contexts);
    }
  });
});
