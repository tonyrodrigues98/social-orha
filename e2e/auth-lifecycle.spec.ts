import { expect, test, type Page, type Response } from "playwright/test";
import {
  createAnonymousBrowserContext,
  currentAppPath,
  e2eBaseUrl,
  openAppPath,
} from "./support/environment";
import {
  closeBrowserContexts,
  runCleanupSteps,
  waitForAuthenticatedShell,
} from "./support/journey-ui";
import {
  createE2EAdminClient,
  deleteTemporaryUser,
  findUserByEmail,
  generateRecoveryLink,
  generateSignupLink,
} from "./support/supabase-admin";

const AUTH_TIMEOUT = 45_000;

function temporaryIdentity(kind: "delivery" | "lifecycle") {
  const token = crypto.randomUUID().replaceAll("-", "");
  const domain = process.env.ORHA_E2E_EMAIL_DOMAIN?.trim().toLowerCase();
  if (!domain) {
    throw new Error("ORHA_E2E_EMAIL_DOMAIN é obrigatório na jornada Auth.");
  }
  return {
    email: `orha-e2e-${kind}-${token}@${domain}`,
    password: `Orha!Primary-${token.slice(0, 16)}-A9`,
    resetPassword: `Orha!Reset-${token.slice(16, 32)}-B7`,
    username: `@e2e_${token.slice(0, 18)}`,
  };
}

async function followSensitiveAuthLink(
  page: Page,
  actionLink: string,
  purpose: string,
): Promise<void> {
  try {
    await page.goto(actionLink, {
      waitUntil: "domcontentloaded",
      timeout: AUTH_TIMEOUT,
    });
  } catch {
    throw new Error(`O callback real de ${purpose} falhou antes de voltar ao ORHA.`);
  }
}

async function extractSignupUserId(
  response: Response,
): Promise<string | null> {
  const payload = (await response.json()) as {
    id?: unknown;
    user?: { id?: unknown };
  };
  const candidate = payload.id ?? payload.user?.id;
  return typeof candidate === "string" ? candidate : null;
}

async function completeRequiredOnboarding(page: Page, username: string) {
  await expect(
    page.getByRole("heading", { level: 1, name: "Como podemos chamar você?" }),
  ).toBeVisible({ timeout: AUTH_TIMEOUT });
  await page.getByLabel("Nome completo").fill("Pessoa E2E ORHA");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Data de nascimento").fill("1990-01-15");
  await page.getByRole("button", { name: "Continuar" }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: "Onde sua história acontece?" }),
  ).toBeVisible({ timeout: AUTH_TIMEOUT });
  await page.getByLabel("Estado").selectOption("SP");
  await expect(page.getByLabel("Cidade")).toBeEnabled({ timeout: AUTH_TIMEOUT });
  await page.getByLabel("Cidade").selectOption({ label: "São Paulo" });
  await page
    .getByLabel("Bio")
    .fill("Perfil temporário criado exclusivamente pelo gate E2E do ORHA.");
  await page.getByRole("button", { name: "Concluir meu perfil agora" }).click();
  await waitForAuthenticatedShell(page);
  await expect.poll(() => currentAppPath(page)).toBe("/inicio");
}

test.describe("jornada A — ciclo Auth real", () => {
  test("cadastro, confirmação, onboarding, sessão e recovery usam Supabase real", async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    expect(
      process.env.ORHA_E2E_SMTP_DELIVERY_VERIFIED,
      "A entrega SMTP é um gate externo obrigatório e não pode ser simulada pelo browser.",
    ).toBe("true");

    const admin = createE2EAdminClient();
    const delivery = temporaryIdentity("delivery");
    const lifecycle = temporaryIdentity("lifecycle");
    const context = await createAnonymousBrowserContext(browser);
    const page = await context.newPage();
    let deliveryUserId: string | null = null;
    let lifecycleUserId: string | null = null;

    try {
      await openAppPath(page, "/auth/signup");
      await page.getByLabel("E-mail").fill(delivery.email);
      await page.getByLabel("Senha", { exact: true }).fill(delivery.password);
      await page.getByLabel("Confirmar senha").fill(delivery.password);
      await page
        .getByRole("checkbox", { name: /18 anos ou mais/ })
        .check();
      await page
        .getByRole("checkbox", { name: /Termos de Uso e a Política/ })
        .check();
      const signupResponse = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname.endsWith("/auth/v1/signup") &&
          response.request().method() === "POST",
        { timeout: AUTH_TIMEOUT },
      );
      await page.getByRole("button", { name: "Criar conta" }).click();
      const signup = await signupResponse;
      expect(signup.ok(), "O cadastro precisa ser aceito pelo Supabase Auth.").toBe(true);
      deliveryUserId = await extractSignupUserId(signup);
      await expect(
        page.getByRole("heading", { level: 1, name: "Enviamos um e-mail" }),
      ).toBeVisible({ timeout: AUTH_TIMEOUT });
      if (!deliveryUserId) {
        deliveryUserId = (await findUserByEmail(admin, delivery.email))?.id ?? null;
      }
      expect(deliveryUserId, "O cadastro real precisa criar um auth.users removível.").not.toBeNull();

      const signupLink = await generateSignupLink(
        admin,
        lifecycle.email,
        lifecycle.password,
        e2eBaseUrl(),
      );
      lifecycleUserId = signupLink.userId;
      await followSensitiveAuthLink(page, signupLink.actionLink, "confirmação");
      await completeRequiredOnboarding(page, lifecycle.username);

      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForAuthenticatedShell(page);
      const reopened = await context.newPage();
      await openAppPath(reopened, "/perfil");
      await waitForAuthenticatedShell(reopened);
      await expect(reopened.getByText("Pessoa E2E ORHA")).toBeVisible();
      await page.close();

      await reopened.getByRole("button", { name: "Sair da conta" }).click();
      await expect.poll(() => currentAppPath(reopened)).toBe("/auth/login");
      const recoveryLink = await generateRecoveryLink(
        admin,
        lifecycle.email,
        e2eBaseUrl(),
      );
      await followSensitiveAuthLink(reopened, recoveryLink, "recuperação");
      await expect(
        reopened.getByRole("heading", { level: 1, name: "Crie uma nova senha" }),
      ).toBeVisible({ timeout: AUTH_TIMEOUT });
      await reopened.getByLabel("Nova senha").fill(lifecycle.resetPassword);
      await reopened
        .getByLabel("Confirmar nova senha")
        .fill(lifecycle.resetPassword);
      const resetResponse = reopened.waitForResponse(
        (response) =>
          new URL(response.url()).pathname.endsWith("/auth/v1/user") &&
          response.request().method() === "PUT",
        { timeout: AUTH_TIMEOUT },
      );
      await reopened.getByRole("button", { name: "Atualizar senha" }).click();
      expect((await resetResponse).ok(), "O reset precisa persistir no Supabase Auth.").toBe(true);
      await waitForAuthenticatedShell(reopened);

      await openAppPath(reopened, "/perfil");
      await reopened.getByRole("button", { name: "Sair da conta" }).click();
      await expect.poll(() => currentAppPath(reopened)).toBe("/auth/login");
      await reopened.getByLabel("E-mail").fill(lifecycle.email);
      await reopened.getByLabel(/^Senha\b/).fill(lifecycle.resetPassword);
      await reopened.getByRole("button", { name: "Entrar" }).click();
      await waitForAuthenticatedShell(reopened);
    } finally {
      await runCleanupSteps([
        {
          name: "remover cadastro temporário do teste SMTP",
          run: async () => {
            const userId =
              deliveryUserId ??
              (await findUserByEmail(admin, delivery.email))?.id ??
              null;
            if (userId) await deleteTemporaryUser(admin, userId);
          },
        },
        {
          name: "remover conta temporária do ciclo Auth",
          run: async () => {
            const userId =
              lifecycleUserId ??
              (await findUserByEmail(admin, lifecycle.email))?.id ??
              null;
            if (userId) await deleteTemporaryUser(admin, userId);
          },
        },
        {
          name: "fechar contexto da jornada Auth",
          run: () => closeBrowserContexts([context]),
        },
      ]);
    }
  });
});
