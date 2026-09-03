import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ContactPage,
  HelpPage,
  PrivacyPolicyPage,
  TermsPage,
} from "./settings-info-pages";
import { SettingsPage } from "./settings-page";
import {
  SETTINGS_INFO_PATHS,
  buildSettingsInfoHref,
  isSettingsInfoPath,
} from "../settings/settings-info-routes";
import { buildSupportMailto, normalizeSupportEmail } from "../settings/support-contact";

const noop = () => undefined;

describe("settings information route contract", () => {
  it("defines recoverable settings paths and respects the deployment base", () => {
    expect(Object.values(SETTINGS_INFO_PATHS)).toEqual([
      "/configuracoes/termos",
      "/configuracoes/privacidade",
      "/configuracoes/ajuda",
      "/configuracoes/contato",
    ]);
    expect(buildSettingsInfoHref(SETTINGS_INFO_PATHS.help, "/social-orha/")).toBe(
      "/social-orha/configuracoes/ajuda",
    );
    expect(buildSettingsInfoHref(SETTINGS_INFO_PATHS.help, "/")).toBe(
      "/configuracoes/ajuda",
    );
    expect(isSettingsInfoPath("/configuracoes/privacidade")).toBe(true);
    expect(isSettingsInfoPath("https://example.com/configuracoes/privacidade")).toBe(false);
  });

  it("exposes all four real destinations from the native settings surface", () => {
    const markup = renderToStaticMarkup(
      <SettingsPage
        initialSection="support"
        onBack={noop}
        onSignedOut={noop}
      />,
    );

    expect(markup).toContain("Informação e suporte");
    expect(markup.match(/href="[^"]*\/configuracoes\/(?:termos|privacidade|ajuda|contato)"/g)).toHaveLength(4);
    expect(markup).toContain('aria-label="Informação e suporte"');
  });
});

describe("settings information pages", () => {
  it("publishes an honest 18+ terms surface with moderation and account rules", () => {
    const markup = renderToStaticMarkup(<TermsPage onBack={noop} />);

    expect(markup).toContain("Termos de Uso");
    expect(markup).toContain("18 anos ou mais");
    expect(markup).toContain("A ORHA usa amizades, e não seguidores");
    expect(markup).toContain("bloquear perfis e denunciar conteúdo");
    expect(markup).toContain("16 de agosto de 2026");
    expect(markup).toContain("não são inventados nesta versão");
    expect(markup).toContain("<article");
  });

  it("explains private email, public defaults, blocking and Supabase processing", () => {
    const markup = renderToStaticMarkup(<PrivacyPolicyPage onBack={noop} />);

    expect(markup).toContain("Seu e-mail não é público");
    expect(markup).toContain("publicações são públicas por padrão");
    expect(markup).toContain("O bloqueio é global");
    expect(markup).toContain("Supabase fornece autenticação");
    expect(markup).toContain("Nenhum serviço conectado à internet pode prometer risco zero");
    expect(markup).toContain("identificação jurídica do controlador");
  });

  it("uses native accessible disclosures for the help topics", () => {
    const markup = renderToStaticMarkup(<HelpPage onBack={noop} />);

    expect(markup).toContain("Dúvidas frequentes");
    expect(markup.match(/<details/g)).toHaveLength(6);
    expect(markup).toContain("Como bloquear ou denunciar?");
    expect(markup).toContain("Ver opções de contato");
  });
});

describe("contact mailto contract", () => {
  it("accepts a public support address and prevents header injection", () => {
    expect(normalizeSupportEmail(" suporte@orha.example ")).toBe("suporte@orha.example");
    expect(normalizeSupportEmail("suporte@orha.example\r\nBcc:alvo@example.com")).toBeNull();
    expect(normalizeSupportEmail("not-an-email")).toBeNull();
    expect(buildSupportMailto("suporte@orha.example")).toContain(
      "mailto:suporte@orha.example?subject=Ajuda+com+a+ORHA",
    );
  });

  it("opens the device mail app without pretending to submit a form", () => {
    const markup = renderToStaticMarkup(
      <ContactPage onBack={noop} supportEmail="suporte@orha.example" />,
    );

    expect(markup).toContain('href="mailto:suporte@orha.example?subject=Ajuda+com+a+ORHA');
    expect(markup).toContain("O envio e a confirmação são feitos pelo seu provedor");
    expect(markup).not.toContain("<form");
    expect(markup).not.toContain("Mensagem enviada");
  });

  it("fails honestly when production has no approved support address", () => {
    const markup = renderToStaticMarkup(<ContactPage onBack={noop} supportEmail={null} />);

    expect(markup).toContain("Canal de e-mail ainda não configurado");
    expect(markup).toContain("Não há mensagem registrada ou aguardando envio");
    expect(markup).not.toContain("mailto:");
    expect(markup).not.toContain("<form");
  });
});
