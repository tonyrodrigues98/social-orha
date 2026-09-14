import { expect, test, type BrowserContext } from "playwright/test";
import { observeRuntimeQuality } from "./support/quality-gate";
import {
  createNamedBrowserContext,
  openAppPath,
  requireNamedCredentials,
} from "./support/environment";
import { closeBrowserContexts, marker, runCleanupSteps } from "./support/journey-ui";
import { createE2EAdminClient, deleteSupportTicketFixture } from "./support/supabase-admin";

test.describe("jornada de suporte persistente", () => {
  test("usuário abre chamado e Suporte assume, responde e resolve", async ({ browser }) => {
    test.setTimeout(180_000);
    requireNamedCredentials("user-a");
    requireNamedCredentials("support");
    const subject = marker("suporte-e2e");
    const initialMessage = `Pedido persistente ${marker("inicial")}`;
    const operatorReply = `Resposta persistente ${marker("suporte")}`;
    const contexts: BrowserContext[] = await Promise.all([
      createNamedBrowserContext(browser, "user-a"),
      createNamedBrowserContext(browser, "support"),
    ]);
    const [userContext, supportContext] = contexts;
    const [userPage, supportPage] = await Promise.all([
      userContext.newPage(),
      supportContext.newPage(),
    ]);
    const userQuality = observeRuntimeQuality(userPage);
    const supportQuality = observeRuntimeQuality(supportPage);
    const admin = createE2EAdminClient();

    try {
      await openAppPath(userPage, "/suporte");
      await expect(userPage.getByRole("heading", { level: 1, name: "Suporte ORHA" })).toBeVisible();
      await userPage.getByRole("button", { name: "Novo" }).click();
      const drawer = userPage.getByRole("dialog", { name: "Novo chamado" });
      await drawer.getByLabel(/^Assunto\b/).fill(subject);
      await drawer.getByRole("combobox", { name: "Categoria", exact: true }).selectOption("technical");
      await drawer.getByLabel(/^Como podemos ajudar\?/).fill(initialMessage);
      await drawer.getByRole("button", { name: "Enviar chamado" }).click();
      await expect(userPage.getByText(initialMessage, { exact: true })).toBeVisible({ timeout: 30_000 });

      await openAppPath(supportPage, "/suporte");
      await expect(supportPage.getByRole("heading", { level: 1, name: "Fila de suporte" })).toBeVisible();
      const ticket = supportPage.getByRole("button", { name: new RegExp(subject) });
      await expect(ticket).toBeVisible({ timeout: 30_000 });
      await ticket.click();
      await supportPage.getByRole("button", { name: "Assumir chamado" }).click();
      await expect(supportPage.getByRole("button", { name: "Assumir chamado" })).toBeHidden({ timeout: 30_000 });
      await supportPage.getByPlaceholder("Responder ao chamado…").fill(operatorReply);
      await supportPage.getByRole("button", { name: "Enviar mensagem" }).click();

      await expect(userPage.getByText(operatorReply, { exact: true })).toBeVisible({ timeout: 30_000 });
      await supportPage.getByLabel("Estado do chamado", { exact: true }).selectOption("resolved");
      await expect(supportPage.getByLabel("Estado do chamado", { exact: true })).toHaveValue("resolved", { timeout: 30_000 });

      userQuality.expectClean();
      supportQuality.expectClean();
    } finally {
      await runCleanupSteps([
        {
          name: "remover chamado e notificações E2E",
          run: () => deleteSupportTicketFixture(admin, subject),
        },
        {
          name: "fechar contextos da jornada de suporte",
          run: () => closeBrowserContexts(contexts),
        },
      ]);
    }
  });
});
