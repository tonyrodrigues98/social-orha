import { Buffer } from "node:buffer";
import path from "node:path";
import {
  expect,
  test,
  type FileChooser,
  type Locator,
  type Page,
} from "playwright/test";
import {
  createNamedBrowserContext,
  currentAppPath,
  openAppPath,
  requireNamedCredentials,
} from "./support/environment";
import { observeRuntimeQuality } from "./support/quality-gate";
import { withSupabaseFailureDiagnostics } from "./support/supabase-diagnostics";
import {
  closeBrowserContexts,
  runCleanupSteps,
} from "./support/journey-ui";

const UI_TIMEOUT = 30_000;
const SUPABASE_MUTATION_TIMEOUT = 45_000;

function privateChat(page: Page): Locator {
  return page.getByRole("dialog", { name: "Conversa privada" });
}

function chatMessage(page: Page, uniqueText: string): Locator {
  return privateChat(page)
    .locator(".chat-message")
    .filter({
      has: page
        .locator(".chat-bubble > p")
        .filter({ hasText: uniqueText }),
    })
    .last();
}

async function waitForConversations(page: Page): Promise<void> {
  await expect(
    page.getByRole("heading", { level: 1, name: "Conversas" }),
  ).toBeVisible({ timeout: UI_TIMEOUT });
  await expect(
    page.getByText("Carregando suas conversas…", { exact: true }),
  ).toBeHidden({ timeout: UI_TIMEOUT });
}

async function waitForPrivateChat(page: Page): Promise<void> {
  await expect(privateChat(page)).toBeVisible({ timeout: UI_TIMEOUT });
  await expect(
    privateChat(page).getByRole("button", { name: "Voltar para conversas" }),
  ).toBeVisible();
  await expect(privateChat(page).getByPlaceholder("Mensagem")).toBeVisible({
    timeout: UI_TIMEOUT,
  });
}

async function expectContractedChatViewport(page: Page): Promise<void> {
  const chat = privateChat(page);
  const header = chat.locator(".orha-private-chat > header");
  const composer = chat.locator(".chat-composer");
  const input = chat.getByPlaceholder("Mensagem");

  await input.focus();
  try {
    await page.setViewportSize({ width: 390, height: 520 });
    await expect(header).toBeInViewport();
    await expect(composer).toBeInViewport();
    await expect(input).toBeFocused();

    const geometry = await chat.evaluate((root) => {
      const chatHeader = root.querySelector<HTMLElement>(
        ".orha-private-chat > header",
      );
      const chatComposer = root.querySelector<HTMLElement>(".chat-composer");
      const composerInput = root.querySelector<HTMLTextAreaElement>(
        '.chat-composer textarea[placeholder="Mensagem"]',
      );
      if (!chatHeader || !chatComposer || !composerInput) return null;
      const headerBox = chatHeader.getBoundingClientRect();
      const composerBox = chatComposer.getBoundingClientRect();
      return {
        viewportHeight: window.innerHeight,
        headerTop: headerBox.top,
        headerBottom: headerBox.bottom,
        composerTop: composerBox.top,
        composerBottom: composerBox.bottom,
        inputFontSize: Number.parseFloat(
          window.getComputedStyle(composerInput).fontSize,
        ),
      };
    });

    expect(geometry).not.toBeNull();
    expect(geometry!.headerTop).toBeGreaterThanOrEqual(-1);
    expect(geometry!.headerBottom).toBeLessThan(geometry!.composerTop);
    expect(geometry!.composerBottom).toBeLessThanOrEqual(
      geometry!.viewportHeight + 1,
    );
    expect(geometry!.inputFontSize).toBeGreaterThanOrEqual(16);
  } finally {
    await page.setViewportSize({ width: 390, height: 844 });
  }
  await expect(header).toBeInViewport();
  await expect(composer).toBeInViewport();
}

async function openConversations(page: Page): Promise<void> {
  await openAppPath(page, "/conversas");
  await waitForConversations(page);
}

async function expectSuccessfulSupabaseMutation(
  page: Page,
  endpoint: RegExp,
  method: "POST" | "PATCH",
  action: () => Promise<unknown>,
): Promise<void> {
  await withSupabaseFailureDiagnostics(page, async () => {
    const responsePromise = page.waitForResponse(
      (response) =>
        endpoint.test(new URL(response.url()).pathname) &&
        response.request().method() === method,
      { timeout: SUPABASE_MUTATION_TIMEOUT },
    );
    await action();
    const response = await responsePromise;
    expect(
      response.ok(),
      `A mutação Supabase ${method} ${endpoint.source} precisa ser confirmada pelo backend.`,
    ).toBe(true);
  });
}

async function tryOpenExistingConversation(
  page: Page,
  remoteProfileText: string,
): Promise<boolean> {
  const conversation = page
    .locator("button.conversation-row")
    .filter({ hasText: remoteProfileText })
    .first();
  if (!(await conversation.isVisible())) return false;

  await conversation.click();
  await waitForPrivateChat(page);
  return true;
}

async function tryAcceptIncomingRequest(
  page: Page,
  remoteProfileText: string,
): Promise<boolean> {
  await page
    .getByRole("button", { name: /^Solicitações(?: \(\d+\))?$/ })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Solicitações de conversa",
  });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText("Carregando solicitações…", { exact: true }),
  ).toBeHidden({ timeout: UI_TIMEOUT });

  const request = dialog
    .locator("article")
    .filter({ hasText: remoteProfileText })
    .first();
  if (!(await request.isVisible())) {
    await dialog.getByRole("button", { name: "Fechar" }).click();
    await expect(dialog).toBeHidden();
    return false;
  }

  await expectSuccessfulSupabaseMutation(
    page,
    /\/rest\/v1\/rpc\/respond_to_conversation_request$/,
    "POST",
    () => request.getByRole("button", { name: "Aceitar" }).click(),
  );
  await waitForPrivateChat(page);
  return true;
}

async function requestConversation(
  page: Page,
  remoteProfileText: string,
  openingMessage: string,
): Promise<void> {
  await page.getByRole("button", { name: "Nova conversa" }).click();
  const dialog = page.getByRole("dialog", { name: "Nova conversa" });
  await expect(dialog).toBeVisible();

  await dialog.getByPlaceholder("Nome ou @username").fill(remoteProfileText);
  await expect(
    dialog.getByText("Carregando pessoas…", { exact: true }),
  ).toBeHidden({ timeout: UI_TIMEOUT });
  const profile = dialog
    .locator('[aria-label="Pessoas disponíveis"] button[aria-pressed]')
    .filter({ hasText: remoteProfileText })
    .first();
  await expect(
    profile,
    "ORHA_E2E_USER_B_PROFILE_TEXT deve identificar uma pessoa pesquisável na UI.",
  ).toBeVisible({ timeout: UI_TIMEOUT });
  await profile.click();
  await dialog
    .getByLabel("Mensagem de apresentação (opcional)")
    .fill(openingMessage);

  await expectSuccessfulSupabaseMutation(
    page,
    /\/rest\/v1\/rpc\/request_conversation$/,
    "POST",
    () => dialog.getByRole("button", { name: "Continuar" }).click(),
  );
  await expect(dialog).toBeHidden({ timeout: UI_TIMEOUT });
}

async function establishDirectConversation(
  pageA: Page,
  pageB: Page,
  profileTextA: string,
  profileTextB: string,
  runToken: string,
): Promise<string> {
  await Promise.all([openConversations(pageA), openConversations(pageB)]);

  if (!(await tryOpenExistingConversation(pageA, profileTextB))) {
    if (!(await tryAcceptIncomingRequest(pageA, profileTextB))) {
      await requestConversation(
        pageA,
        profileTextB,
        `Solicitação real de teste ${runToken}`,
      );

      const openedImmediately = await privateChat(pageA)
        .isVisible()
        .catch(() => false);
      if (!openedImmediately) {
        await openConversations(pageB);
        if (!(await tryOpenExistingConversation(pageB, profileTextA))) {
          expect(
            await tryAcceptIncomingRequest(pageB, profileTextA),
            "A solicitação A→B deve aparecer e ser aceita pela conta B.",
          ).toBe(true);
        }
      }
    }
  }

  const sourcePage = (await privateChat(pageA).isVisible()) ? pageA : pageB;
  const conversationPath = currentAppPath(sourcePage);
  expect(conversationPath).toMatch(/^\/conversas\/[^/]+$/);

  await Promise.all(
    [pageA, pageB].map(async (page) => {
      if (currentAppPath(page) !== conversationPath) {
        await openAppPath(page, conversationPath);
      }
      await waitForPrivateChat(page);
    }),
  );
  return conversationPath;
}

async function sendTextMessage(page: Page, text: string): Promise<void> {
  const composer = privateChat(page).getByPlaceholder("Mensagem");
  await composer.fill(text);
  await expectSuccessfulSupabaseMutation(
    page,
    /\/rest\/v1\/rpc\/send_message$/,
    "POST",
    () =>
      privateChat(page)
        .getByRole("button", { name: "Enviar mensagem" })
        .click(),
  );
  await expect(chatMessage(page, text)).toBeVisible({ timeout: UI_TIMEOUT });
}

async function replyToMessage(
  page: Page,
  sourceText: string,
  replyText: string,
): Promise<void> {
  const source = chatMessage(page, sourceText);
  await source.scrollIntoViewIfNeeded();
  await source.hover();
  await source
    .locator("[data-message-id]")
    .getByRole("button", { name: "Responder" })
    .click();

  const composer = privateChat(page).getByPlaceholder("Escreva sua resposta");
  await expect(composer).toBeVisible();
  await composer.fill(replyText);
  await expectSuccessfulSupabaseMutation(
    page,
    /\/rest\/v1\/rpc\/send_message$/,
    "POST",
    () =>
      privateChat(page)
        .getByRole("button", { name: "Enviar mensagem" })
        .click(),
  );

  const reply = chatMessage(page, replyText);
  await expect(reply).toBeVisible({ timeout: UI_TIMEOUT });
  await expect(reply.getByText(sourceText, { exact: true })).toBeVisible();
}

async function reactToMessage(
  page: Page,
  sourceText: string,
  emoji: string,
): Promise<void> {
  const source = chatMessage(page, sourceText);
  await source.scrollIntoViewIfNeeded();
  await source.hover();
  const toolbar = source.locator("[data-message-id]");
  await toolbar.getByRole("button", { name: "Adicionar reação" }).click();
  await expectSuccessfulSupabaseMutation(
    page,
    /\/rest\/v1\/rpc\/set_message_reaction$/,
    "POST",
    () => toolbar.getByRole("button", { name: `React with ${emoji}` }).click(),
  );
  await expect(
    source.getByRole("button", { name: `${emoji} 1 reaction` }),
  ).toBeVisible({ timeout: UI_TIMEOUT });
}

async function forwardToCurrentConversation(
  page: Page,
  sourceText: string,
  conversationTitle: string,
): Promise<void> {
  const source = chatMessage(page, sourceText);
  await source.scrollIntoViewIfNeeded();
  await source.hover();
  const toolbar = source.locator("[data-message-id]");
  await toolbar.getByRole("button", { name: "Mais ações" }).click();
  await toolbar.getByRole("button", { name: "Encaminhar" }).click();

  const dialog = page.getByRole("dialog", { name: "Encaminhar mensagem" });
  await expect(dialog).toBeVisible();
  const target = dialog
    .locator("button[aria-pressed]")
    .filter({ hasText: conversationTitle })
    .first();
  await expect(target).toBeVisible({ timeout: UI_TIMEOUT });
  await target.click();
  await expectSuccessfulSupabaseMutation(
    page,
    /\/rest\/v1\/rpc\/forward_message$/,
    "POST",
    () => dialog.getByRole("button", { name: "Encaminhar (1)" }).click(),
  );
  await expect(dialog).toBeHidden({ timeout: UI_TIMEOUT });

  const forwarded = chatMessage(page, sourceText);
  await expect(forwarded.getByText("Encaminhada", { exact: true })).toBeVisible({
    timeout: UI_TIMEOUT,
  });
}

async function chooseAttachment(
  page: Page,
  menuItemName: "Foto" | "Áudio",
  setFiles: Parameters<FileChooser["setFiles"]>[0],
): Promise<void> {
  const chooserPromise = page.waitForEvent("filechooser");
  await privateChat(page)
    .getByRole("button", { name: "Abrir opções de anexo" })
    .click();
  await privateChat(page)
    .getByRole("menuitem", { name: menuItemName })
    .click();
  const chooser = await chooserPromise;
  await chooser.setFiles(setFiles);
}

async function sendAttachmentMessage(
  page: Page,
  caption: string,
  fileName: string,
  menuItemName: "Foto" | "Áudio",
  setFiles: Parameters<FileChooser["setFiles"]>[0],
): Promise<void> {
  await privateChat(page).getByPlaceholder("Mensagem").fill(caption);
  await chooseAttachment(page, menuItemName, setFiles);
  await expect(
    privateChat(page).getByRole("button", { name: `Remover ${fileName}` }),
    `${fileName} precisa estar realmente anexado antes do envio.`,
  ).toBeVisible();

  await expectSuccessfulSupabaseMutation(
    page,
    /\/functions\/v1\/media-verify$/,
    "POST",
    () =>
      privateChat(page)
        .getByRole("button", { name: "Enviar mensagem" })
        .click(),
  );
  await expect(chatMessage(page, caption)).toBeVisible({ timeout: UI_TIMEOUT });
}

function createValidPcmWav(durationSeconds = 4, sampleRate = 8_000): Buffer {
  const channelCount = 1;
  const bitsPerSample = 16;
  const sampleCount = Math.floor(durationSeconds * sampleRate);
  const bytesPerSample = bitsPerSample / 8;
  const dataSize = sampleCount * channelCount * bytesPerSample;
  const wav = Buffer.alloc(44 + dataSize);

  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write("WAVE", 8, "ascii");
  wav.write("fmt ", 12, "ascii");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(channelCount, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * channelCount * bytesPerSample, 28);
  wav.writeUInt16LE(channelCount * bytesPerSample, 32);
  wav.writeUInt16LE(bitsPerSample, 34);
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(dataSize, 40);

  for (let sample = 0; sample < sampleCount; sample += 1) {
    const envelope = Math.sin((Math.PI * sample) / sampleCount);
    const value = Math.round(
      Math.sin((2 * Math.PI * 440 * sample) / sampleRate) *
        envelope *
        12_000,
    );
    wav.writeInt16LE(value, 44 + sample * bytesPerSample);
  }
  return wav;
}

async function openConversationMenu(page: Page): Promise<Locator> {
  await privateChat(page)
    .getByRole("button", { name: "Mais opções da conversa" })
    .click();
  const menu = privateChat(page).getByRole("menu", {
    name: "Opções da conversa",
  });
  await expect(menu).toBeVisible();
  return menu;
}

async function setNotificationsEnabled(
  page: Page,
  enabled: boolean,
): Promise<void> {
  const menu = await openConversationMenu(page);
  const actionName = enabled
    ? "Ativar notificações"
    : "Silenciar notificações";
  const action = menu.getByRole("menuitem", { name: actionName });

  if ((await action.count()) === 0) {
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    return;
  }

  await expectSuccessfulSupabaseMutation(
    page,
    /\/rest\/v1\/conversation_preferences$/,
    "PATCH",
    () => action.click(),
  );
  await expect(
    page.getByRole("status").filter({
      hasText: enabled
        ? "Notificações ativadas."
        : "Notificações silenciadas.",
    }),
  ).toBeVisible();
}

async function expectPersistedMenuAction(
  page: Page,
  actionName: "Ativar notificações" | "Silenciar notificações",
): Promise<void> {
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForPrivateChat(page);
  const menu = await openConversationMenu(page);
  await expect(menu.getByRole("menuitem", { name: actionName })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
}

async function notificationsEnabled(page: Page): Promise<boolean> {
  const menu = await openConversationMenu(page);
  const canSilence = await menu
    .getByRole("menuitem", { name: "Silenciar notificações" })
    .count();
  const canActivate = await menu
    .getByRole("menuitem", { name: "Ativar notificações" })
    .count();
  expect(
    [canSilence, canActivate],
    "O menu precisa expor exatamente uma ação coerente com a preferência atual.",
  ).toEqual(canSilence ? [1, 0] : [0, 1]);
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  return canSilence === 1;
}

async function deleteSentMessage(page: Page, uniqueText: string): Promise<void> {
  const message = privateChat(page)
    .locator('.chat-message[data-message-direction="outgoing"]')
    .filter({ hasText: uniqueText })
    .last();
  if (!(await message.isVisible().catch(() => false))) return;

  await message.scrollIntoViewIfNeeded();
  await message.hover();
  const messageId = await message.getAttribute("data-chat-message-id");
  expect(messageId, "A mensagem precisa expor seu identificador estável.").toBeTruthy();
  const toolbar = message.locator("[data-message-id]");
  const moreActions = toolbar.getByRole("button", { name: "Mais ações" });
  await moreActions.focus();
  await moreActions.press("Enter");
  const deleteAction = toolbar.getByRole("button", {
    name: "Excluir",
    exact: true,
  });
  await expect(deleteAction).toBeVisible({ timeout: 5_000 });
  await deleteAction.click();
  const confirmation = page.getByRole("alertdialog", {
    name: "Excluir mensagem?",
  });
  await expect(confirmation).toBeVisible();
  await expectSuccessfulSupabaseMutation(
    page,
    /\/rest\/v1\/rpc\/delete_message$/,
    "POST",
    () =>
      confirmation
        .getByRole("button", { name: "Excluir", exact: true })
        .click(),
  );
  await expect(
    privateChat(page)
      .locator(`.chat-message[data-chat-message-id="${messageId}"]`)
      .getByText("Mensagem excluída", { exact: true }),
  ).toBeVisible({ timeout: UI_TIMEOUT });
}

test.describe("jornada real de mensagens entre duas contas", () => {
  test("persiste texto, reply, reação, encaminhamento, mídia, recibo e preferência", async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    const credentialsA = requireNamedCredentials("user-a");
    const credentialsB = requireNamedCredentials("user-b");
    const runToken = `ORHA-E2E-${Date.now()}`;
    const textMessage = `Mensagem real ${runToken}`;
    const replyMessage = `Resposta real ${runToken}`;
    const imageCaption = `Imagem real ${runToken}`;
    const audioCaption = `Áudio WAV real ${runToken}`;
    const audioFileName = `${runToken}.wav`;
    const imageFileName = "orha-icon-192.png";

    const [contextA, contextB] = await Promise.all([
      createNamedBrowserContext(browser, "user-a"),
      createNamedBrowserContext(browser, "user-b"),
    ]);
    const [pageA, pageB] = await Promise.all([
      contextA.newPage(),
      contextB.newPage(),
    ]);
    const qualityA = observeRuntimeQuality(pageA);
    const qualityB = observeRuntimeQuality(pageB);
    const sentMessages: Array<{ page: Page; text: string }> = [];
    let originalNotificationsEnabled: boolean | null = null;
    let notificationsNeedRestore = false;

    try {
      await establishDirectConversation(
        pageA,
        pageB,
        credentialsA.expectedProfileText!,
        credentialsB.expectedProfileText!,
        runToken,
      );

      await expectContractedChatViewport(pageA);

      await sendTextMessage(pageA, textMessage);
      sentMessages.push({ page: pageA, text: textMessage });
      await expect(chatMessage(pageB, textMessage)).toBeVisible({
        timeout: UI_TIMEOUT,
      });
      await expect(
        chatMessage(pageA, textMessage).getByRole("img", {
          name: /^(?:Entregue|Lida)$/,
        }),
        "O recibo entregue/lido precisa ter nome acessível.",
      ).toBeVisible({ timeout: UI_TIMEOUT });

      await replyToMessage(pageB, textMessage, replyMessage);
      sentMessages.push({ page: pageB, text: replyMessage });
      await expect(chatMessage(pageA, replyMessage)).toBeVisible({
        timeout: UI_TIMEOUT,
      });
      await expect(
        chatMessage(pageA, replyMessage).getByText(textMessage, {
          exact: true,
        }),
      ).toBeVisible();

      await reactToMessage(pageB, textMessage, "👍");
      await expect(
        chatMessage(pageA, textMessage).getByRole("button", {
          name: "👍 1 reaction",
        }),
      ).toBeVisible({ timeout: UI_TIMEOUT });

      await forwardToCurrentConversation(
        pageA,
        textMessage,
        credentialsB.expectedProfileText!,
      );
      sentMessages.push({ page: pageA, text: textMessage });
      await expect(
        chatMessage(pageB, textMessage).getByText("Encaminhada", {
          exact: true,
        }),
      ).toBeVisible({ timeout: UI_TIMEOUT });

      await sendAttachmentMessage(
        pageA,
        imageCaption,
        imageFileName,
        "Foto",
        path.resolve("public/brand/orha-icon-192.png"),
      );
      sentMessages.push({ page: pageA, text: imageCaption });
      await expect(chatMessage(pageB, imageCaption)).toBeVisible({
        timeout: UI_TIMEOUT,
      });

      await sendAttachmentMessage(
        pageA,
        audioCaption,
        audioFileName,
        "Áudio",
        {
          name: audioFileName,
          mimeType: "audio/wav",
          buffer: createValidPcmWav(),
        },
      );
      sentMessages.push({ page: pageA, text: audioCaption });
      await expect(chatMessage(pageB, audioCaption)).toBeVisible({
        timeout: UI_TIMEOUT,
      });

      await pageB.reload({ waitUntil: "domcontentloaded" });
      await waitForPrivateChat(pageB);
      await expect(chatMessage(pageB, textMessage)).toBeVisible({
        timeout: UI_TIMEOUT,
      });
      await expect(
        chatMessage(pageB, imageCaption).getByRole("img", {
          name: imageFileName,
        }),
      ).toBeVisible({ timeout: UI_TIMEOUT });

      const audioMessage = chatMessage(pageB, audioCaption);
      const audioGroup = audioMessage.getByRole("group", {
        name: "Mensagem de áudio",
      });
      const waveform = audioGroup.getByLabel("Forma de onda do áudio");
      const position = audioGroup.getByRole("slider", {
        name: "Posição do áudio",
      });
      await expect(audioGroup).toBeVisible({ timeout: UI_TIMEOUT });
      await expect(waveform).toBeVisible();
      await expect(position).toBeVisible();
      await expect
        .poll(
          () =>
            waveform
              .locator(".chat-real-waveform")
              .evaluate((element) => element.childElementCount > 0),
          { message: "WaveSurfer precisa renderizar a forma de onda real." },
        )
        .toBe(true);

      await audioGroup.getByRole("button", { name: "Reproduzir áudio" }).click();
      await expect(
        audioGroup.getByRole("button", { name: "Pausar áudio" }),
      ).toBeVisible();
      await expect
        .poll(() => position.inputValue().then(Number), {
          message: "A posição da waveform deve avançar durante a reprodução.",
        })
        .toBeGreaterThan(0);
      await audioGroup.getByRole("button", { name: "Pausar áudio" }).click();

      originalNotificationsEnabled = await notificationsEnabled(pageA);
      notificationsNeedRestore = true;
      await setNotificationsEnabled(pageA, !originalNotificationsEnabled);
      await expectPersistedMenuAction(
        pageA,
        originalNotificationsEnabled
          ? "Ativar notificações"
          : "Silenciar notificações",
      );
      await setNotificationsEnabled(pageA, originalNotificationsEnabled);
      await expectPersistedMenuAction(
        pageA,
        originalNotificationsEnabled
          ? "Silenciar notificações"
          : "Ativar notificações",
      );
      notificationsNeedRestore = false;

      qualityA.expectClean();
      qualityB.expectClean();
    } finally {
      await runCleanupSteps([
        {
          name: "restaurar preferência de notificações",
          run:
            notificationsNeedRestore && originalNotificationsEnabled !== null
              ? () => setNotificationsEnabled(pageA, originalNotificationsEnabled!)
              : undefined,
        },
        ...sentMessages.reverse().map(({ page, text }) => ({
          name: `excluir mensagem E2E ${text}`,
          run: () => deleteSentMessage(page, text),
        })),
        {
          name: "fechar contextos da jornada de mensagens",
          run: () => closeBrowserContexts([contextA, contextB]),
        },
      ]);
    }
  });
});
