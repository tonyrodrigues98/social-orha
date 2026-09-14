import { test, expect } from "./support/quality-gate";
import { waitForPublicAuth } from "./support/auth-ui";
import {
  currentAppPath,
  expectedSupabaseHost,
  openApp,
  openAppPath,
} from "./support/environment";

test.describe("Auth público e guards", () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
    await waitForPublicAuth(page);
  });

  test("mantém visitante fora das áreas autenticadas", async ({ page }) => {
    await expect.poll(() => currentAppPath(page)).toBe("/auth/login");
    await expect(
      page.getByRole("navigation", { name: "Navegação principal" }),
    ).toHaveCount(0);

    await openAppPath(page, "/conversas");
    await waitForPublicAuth(page);
    await expect.poll(() => currentAppPath(page)).toBe("/auth/login");
    expect(new URL(page.url()).searchParams.get("redirect")).toBe("/conversas");
    await expect(
      page.getByRole("navigation", { name: "Navegação principal" }),
    ).toHaveCount(0);

    await openAppPath(page, "/suporte");
    await waitForPublicAuth(page);
    await expect.poll(() => currentAppPath(page)).toBe("/auth/login");
    expect(new URL(page.url()).searchParams.get("redirect")).toBe("/suporte");
  });

  test("mantém rotas públicas endereçáveis e trata caminho inexistente", async ({
    page,
  }) => {
    await openAppPath(page, "/auth/signup");
    await expect(
      page.getByRole("heading", { level: 1, name: "Criar uma conta" }),
    ).toBeVisible();
    await expect.poll(() => currentAppPath(page)).toBe("/auth/signup");

    await openAppPath(page, "/rota-que-nao-existe");
    await expect(
      page.getByRole("heading", { level: 1, name: "Essa tela não existe." }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Ir para o acesso" }).click();
    await waitForPublicAuth(page);
    await expect.poll(() => currentAppPath(page)).toBe("/auth/login");
  });

  test("expõe cadastro e validações sem chamar o backend", async ({ page }) => {
    await page.getByRole("button", { name: "Criar conta" }).click();
    await expect.poll(() => currentAppPath(page)).toBe("/auth/signup");
    await expect(
      page.getByRole("heading", { level: 1, name: "Criar uma conta" }),
    ).toBeFocused();
    await expect(
      page.getByRole("checkbox", { name: /18 anos ou mais/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("checkbox", { name: /Termos de Uso/ }),
    ).toBeVisible();

    const backendRequests: string[] = [];
    const captureBackendRequest = (request: { url: () => string }) => {
      if (request.url().includes(expectedSupabaseHost())) {
        backendRequests.push(request.url());
      }
    };
    page.on("request", captureBackendRequest);
    await page.getByRole("button", { name: "Criar conta" }).click();
    await expect(page.getByText("Informe seu e-mail.")).toBeVisible();
    await expect(page.getByText("Crie uma senha.")).toBeVisible();
    await expect(page.getByText("Confirme sua senha.")).toBeVisible();
    page.off("request", captureBackendRequest);
    expect(
      backendRequests,
      "Validação local inválida não deve chegar ao Supabase.",
    ).toEqual([]);
  });

  test("abre recuperação de senha sem disparar envio", async ({ page }) => {
    await page.getByRole("button", { name: "Esqueci minha senha" }).click();
    await expect.poll(() => currentAppPath(page)).toBe("/forgot-password");
    await expect(
      page.getByRole("heading", { level: 1, name: "Esqueceu sua senha?" }),
    ).toBeFocused();
    await expect(page.getByLabel("E-mail da conta")).toBeVisible();
    await page.getByRole("button", { name: "Voltar" }).click();
    await waitForPublicAuth(page);
    await expect.poll(() => currentAppPath(page)).toBe("/auth/login");

    await openAppPath(page, "/reset-password");
    await waitForPublicAuth(page);
    await expect.poll(() => currentAppPath(page)).toBe("/auth/login");
  });

  test("mantém um alias de acesso retrocompatível", async ({ page }) => {
    await openAppPath(page, "/entrar");
    await waitForPublicAuth(page);
    await expect.poll(() => currentAppPath(page)).toBe("/entrar");
  });

  test("não expõe OAuth Google enquanto o provider está desligado", async ({
    page,
  }) => {
    await expect(
      page.getByRole("button", { name: "Continuar com Google" }),
    ).toHaveCount(0);
    await expect(page.getByText(/Google.*ativad[oa] em breve/i)).toHaveCount(0);
  });
});
