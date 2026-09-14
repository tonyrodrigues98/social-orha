import { expect, test } from "playwright/test";
import { waitForPublicAuth } from "./support/auth-ui";
import { openApp } from "./support/environment";

type WebManifest = {
  display?: string;
  orientation?: string;
  start_url?: string;
  icons?: Array<{ src?: string }>;
};

test.describe("PWA de produção", () => {
  test.describe.configure({ timeout: 60_000 });

  test("instala o worker, entrega os assets do manifest e reabre o shell offline", async ({
    context,
    page,
  }) => {
    const pageErrors: string[] = [];
    const onlineConsoleErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") onlineConsoleErrors.push(message.text());
    });
    await openApp(page);

    const manifestHref = await page
      .locator('link[rel="manifest"]')
      .getAttribute("href");
    expect(manifestHref, "O documento precisa anunciar o web manifest.").toBeTruthy();

    const manifestUrl = new URL(manifestHref!, page.url()).toString();
    const manifestResponse = await page.request.get(manifestUrl);
    expect(manifestResponse.ok(), "O web manifest precisa responder com sucesso.").toBe(
      true,
    );
    expect(manifestResponse.headers()["content-type"]).toMatch(
      /application\/(?:manifest\+json|json)/i,
    );
    const manifest = (await manifestResponse.json()) as WebManifest;
    expect(manifest.display).toBe("standalone");
    expect(manifest.orientation).toBe("portrait-primary");
    expect(manifest.start_url).toBeTruthy();
    expect(new URL(manifest.start_url!, manifestUrl).pathname).toBe(
      new URL("./", page.url()).pathname,
    );
    expect(manifest.icons?.length ?? 0).toBeGreaterThanOrEqual(2);

    for (const icon of manifest.icons ?? []) {
      expect(icon.src, "Todo ícone do manifest precisa declarar src.").toBeTruthy();
      const iconUrl = new URL(icon.src!, manifestUrl);
      expect(iconUrl.origin).toBe(new URL(manifestUrl).origin);
      const iconResponse = await page.request.get(iconUrl.toString());
      expect(iconResponse.ok(), `Ícone PWA indisponível: ${icon.src}`).toBe(true);
      expect(iconResponse.headers()["content-type"]).toMatch(/^image\//i);
    }

    const registration = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return null;
      const timeout = new Promise<never>((_resolve, reject) => {
        window.setTimeout(
          () => reject(new Error("Timeout aguardando o service worker.")),
          20_000,
        );
      });
      const ready = await Promise.race([navigator.serviceWorker.ready, timeout]);
      const worker = ready.active ?? ready.waiting ?? ready.installing;
      if (!worker) {
        throw new Error("O registro não expôs um service worker.");
      }
      if (worker.state !== "activated") {
        await Promise.race([
          new Promise<void>((resolve, reject) => {
            const onStateChange = () => {
              if (worker.state === "activated") {
                worker.removeEventListener("statechange", onStateChange);
                resolve();
              } else if (worker.state === "redundant") {
                worker.removeEventListener("statechange", onStateChange);
                reject(new Error("O service worker ficou redundante durante a ativação."));
              }
            };
            worker.addEventListener("statechange", onStateChange);
          }),
          timeout,
        ]);
      }
      return {
        active: worker.state,
        scope: ready.scope,
      };
    });
    expect(registration?.active).toBe("activated");
    expect(new URL(registration!.scope).pathname).toBe(
      new URL("./", manifestUrl).pathname,
    );

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect
      .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
      .toBe(true);
    expect(onlineConsoleErrors, "O boot online do PWA não deve gerar erros.").toEqual(
      [],
    );

    await waitForPublicAuth(page);
    await page.getByRole("button", { name: "Criar conta" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Criar uma conta" }),
    ).toBeVisible();
    await page.setViewportSize({ width: 320, height: 568 });

    await context.setOffline(true);
    try {
      const offlineResponse = await page.reload({ waitUntil: "domcontentloaded" });
      expect(offlineResponse?.ok(), "O app shell deve vir do cache offline.").toBe(true);
      await expect(page.locator("#root")).not.toBeEmpty();
      await expect(page.locator(".native-app-shell")).toBeAttached();
      await expect(page.getByText("Sem conexão", { exact: true })).toBeVisible();
      await expect(page.getByText(/novos dados e alterações exigem internet/i)).toBeVisible();
      await expect(page.getByText(/disponível offline/i)).toHaveCount(0);

      const submitButton = page
        .locator(".access-form")
        .getByRole("button", { name: "Criar conta" });
      await submitButton.scrollIntoViewIfNeeded();
      await expect(submitButton).toBeVisible();

      const compactGeometry = await page.evaluate(() => {
        const button = document.querySelector<HTMLElement>(
          ".access-form .access-primary-button",
        );
        const notice = document.querySelector<HTMLElement>(
          ".pwa-runtime-notices > *",
        );
        if (!button || !notice) return null;

        const buttonRect = button.getBoundingClientRect();
        const noticeRect = notice.getBoundingClientRect();
        const centerX = buttonRect.left + buttonRect.width / 2;
        const centerY = buttonRect.top + buttonRect.height / 2;
        const centerTarget = document.elementFromPoint(centerX, centerY);

        return {
          buttonBottom: buttonRect.bottom,
          noticeTop: noticeRect.top,
          centerReachesButton:
            centerTarget === button || Boolean(centerTarget && button.contains(centerTarget)),
        };
      });

      expect(compactGeometry, "O CTA e o aviso offline precisam existir.").not.toBeNull();
      expect(
        compactGeometry!.buttonBottom,
        "O aviso PWA não pode cobrir o CTA do cadastro em 320×568.",
      ).toBeLessThanOrEqual(compactGeometry!.noticeTop);
      expect(
        compactGeometry!.centerReachesButton,
        "O centro do CTA precisa permanecer acionável.",
      ).toBe(true);
      expect(pageErrors, "O boot online/offline não deve gerar pageerror.").toEqual([]);
    } finally {
      await context.setOffline(false);
    }
  });
});
