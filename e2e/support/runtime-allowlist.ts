export type RuntimeIssueKind = "console" | "pageerror" | "requestfailed" | "response";

export type RuntimeAllowance = {
  kind: RuntimeIssueKind;
  url?: RegExp;
  message?: RegExp;
  status?: number;
  reason: string;
};

/**
 * Add only a narrowly-scoped, reviewed production exception with a reason;
 * never silence an entire host or status class.
 */
export const runtimeAllowlist: readonly RuntimeAllowance[] = [
  {
    kind: "response",
    status: 404,
    url: /^https:\/\/tonyrodrigues98\.github\.io\/social-orha\/(?:auth\/(?:login|signup)|forgot-password|reset-password|entrar|cadastro|recuperar-senha|redefinir-senha|onboarding|inicio|comunidade(?:\/[^/?#]+)?|explorar|conversas(?:\/[^/?#]+)?|perfil(?:\/[^/?#]+)?|notificacoes|configuracoes(?:\/(?:conta|seguranca|termos|privacidade|ajuda|contato))?|denunciar\/(?:profile|community|community_post|post_comment|message)\/[^/?#]+|admin\/moderacao|rota-que-nao-existe)(?:[?#].*)?$/,
    reason:
      "GitHub Pages returns its custom 404 document once before the SPA route-restoration redirect.",
  },
];
