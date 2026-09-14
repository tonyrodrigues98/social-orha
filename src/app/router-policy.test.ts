import { readFileSync } from "node:fs";
import path from "node:path";
import { createMemoryHistory } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import type { AuthContextValue } from "./auth/auth-context";
import { createAppRouter, routeTree } from "./router";
import {
  ROUTE_PATHS,
  LEGACY_AUTH_PATHS,
  buildCommunityPath,
  buildCommunityPostPath,
  buildConversationPath,
  canAccessModeration,
  getConversationIdFromPathname,
  getEntryRedirect,
  getOnboardingRedirect,
  getProtectedRedirect,
  getPublicAuthRedirect,
  getResetPasswordRedirect,
  getSectionFromPathname,
  isReportTargetId,
  normalizeRouterBasePath,
  parsePostAuthRedirect,
  type RouteAuthSnapshot,
} from "./router-policy";

const signedOut: RouteAuthSnapshot = {
  status: "signed_out",
  isPasswordRecovery: false,
  onboardingCompleted: false,
  role: null,
  accountStatus: null,
  accountAccessEnabled: null,
};
const onboarding: RouteAuthSnapshot = {
  status: "ready",
  isPasswordRecovery: false,
  onboardingCompleted: false,
  role: "user",
  accountStatus: "active",
  accountAccessEnabled: true,
};
const authenticated: RouteAuthSnapshot = {
  status: "ready",
  isPasswordRecovery: false,
  onboardingCompleted: true,
  role: "user",
  accountStatus: "active",
  accountAccessEnabled: true,
};

function authenticatedContext(
  role: "user" | "moderator" = "user",
  accountStatus: "active" | "restricted" = "active",
  accountAccessEnabled = accountStatus === "active",
): AuthContextValue {
  return {
    status: "ready",
    session: null,
    user: null,
    identity: {
      profile: { onboarding_completed_at: "2026-08-16T00:00:00.000Z" },
      role,
      moderationState: {
        status: accountStatus,
        recorded_status: accountStatus,
        access_enabled: accountAccessEnabled,
      },
    } as AuthContextValue["identity"],
    isPasswordRecovery: false,
    error: null,
    refreshIdentity: async () => undefined,
    finishPasswordRecovery: () => undefined,
  };
}

function signedOutContext(): AuthContextValue {
  return {
    status: "signed_out",
    session: null,
    user: null,
    identity: null,
    isPasswordRecovery: false,
    error: null,
    refreshIdentity: async () => undefined,
    finishPasswordRecovery: () => undefined,
  };
}

function onboardingContext(): AuthContextValue {
  return {
    ...authenticatedContext(),
    identity: {
      profile: { onboarding_completed_at: null },
      moderationState: {
        status: "active",
        recorded_status: "active",
        access_enabled: true,
      },
      role: "user",
    } as AuthContextValue["identity"],
  };
}

describe("ORHA route policy", () => {
  it("registers the complete minimum route tree and a root-level 404", () => {
    const router = createAppRouter({
      auth: authenticatedContext(),
      history: createMemoryHistory({ initialEntries: [ROUTE_PATHS.home] }),
    });

    expect(Object.keys(router.routesByPath)).toEqual(
      expect.arrayContaining(Object.values(ROUTE_PATHS)),
    );
    expect(Object.keys(router.routesByPath)).toEqual(
      expect.arrayContaining(Object.values(LEGACY_AUTH_PATHS)),
    );
    expect(router.options.notFoundMode).toBe("root");
    expect(routeTree.options.notFoundComponent).toBeTypeOf("function");
  });

  it("guards auth, onboarding, recovery and completed accounts", () => {
    expect(getEntryRedirect(signedOut)).toBe(ROUTE_PATHS.signIn);
    expect(getEntryRedirect(onboarding)).toBe(ROUTE_PATHS.onboarding);
    expect(getEntryRedirect(authenticated)).toBe(ROUTE_PATHS.home);
    expect(getProtectedRedirect(signedOut)).toBe(ROUTE_PATHS.signIn);
    expect(getProtectedRedirect(onboarding)).toBe(ROUTE_PATHS.onboarding);
    expect(getProtectedRedirect(authenticated)).toBeNull();
    expect(getOnboardingRedirect(authenticated, "/perfil")).toBe("/perfil");
    expect(getPublicAuthRedirect(authenticated, "/conversas/ana-clara")).toBe(
      "/conversas/ana-clara",
    );
    expect(getResetPasswordRedirect(signedOut)).toBe(ROUTE_PATHS.signIn);
    expect(getResetPasswordRedirect({
      ...authenticated,
      isPasswordRecovery: true,
    })).toBeNull();
  });

  it("limits a restricted account without blocking its account settings", () => {
    const restricted: RouteAuthSnapshot = {
      ...authenticated,
      accountStatus: "restricted",
    };
    expect(getEntryRedirect(restricted)).toBe(ROUTE_PATHS.accountSettings);
    expect(getProtectedRedirect(restricted, ROUTE_PATHS.home)).toBe(
      ROUTE_PATHS.accountSettings,
    );
    expect(getProtectedRedirect(restricted, ROUTE_PATHS.accountSettings)).toBeNull();
    expect(getProtectedRedirect(restricted, ROUTE_PATHS.terms)).toBeNull();
    expect(getProtectedRedirect(restricted, ROUTE_PATHS.privacyPolicy)).toBeNull();
    expect(getProtectedRedirect(restricted, ROUTE_PATHS.help)).toBeNull();
    expect(getProtectedRedirect(restricted, ROUTE_PATHS.contact)).toBeNull();
  });

  it("fails closed when the effective status and access flag disagree", () => {
    const disabled: RouteAuthSnapshot = {
      ...authenticated,
      accountAccessEnabled: false,
    };
    expect(getEntryRedirect(disabled)).toBe(ROUTE_PATHS.accountSettings);
    expect(getProtectedRedirect(disabled, ROUTE_PATHS.home)).toBe(
      ROUTE_PATHS.accountSettings,
    );
    expect(canAccessModeration({ ...disabled, role: "super_admin" })).toBe(false);
  });

  it("accepts only internal post-auth app destinations", () => {
    const communityId = "123e4567-e89b-42d3-a456-426614174000";
    const postId = "123e4567-e89b-42d3-a456-426614174001";
    expect(parsePostAuthRedirect("/inicio")).toBe("/inicio");
    expect(parsePostAuthRedirect("/conversas/ana%20clara?from=push#message")).toBe(
      "/conversas/ana%20clara",
    );
    expect(parsePostAuthRedirect("https://example.com/inicio")).toBeUndefined();
    expect(parsePostAuthRedirect("//example.com/inicio")).toBeUndefined();
    expect(parsePostAuthRedirect("/entrar")).toBeUndefined();
    expect(parsePostAuthRedirect("/conversas/a/b")).toBeUndefined();
    expect(parsePostAuthRedirect("/notificacoes")).toBe(ROUTE_PATHS.notifications);
    expect(parsePostAuthRedirect(`/comunidade/${communityId}`)).toBe(
      `/comunidade/${communityId}`,
    );
    expect(
      parsePostAuthRedirect(`/comunidade/${communityId}/publicacoes/${postId}?from=push`),
    ).toBe(`/comunidade/${communityId}/publicacoes/${postId}`);
    expect(parsePostAuthRedirect("/comunidade/abc-123")).toBeUndefined();
    expect(
      parsePostAuthRedirect(`/comunidade/${communityId}/publicacoes/abc-123`),
    ).toBeUndefined();
    expect(
      parsePostAuthRedirect(`/comunidade/${communityId}/publicacoes/${postId}/extra`),
    ).toBeUndefined();
    expect(
      parsePostAuthRedirect(`/comunidade/${communityId}/publicacoes/%2F`),
    ).toBeUndefined();
    expect(parsePostAuthRedirect("/perfil/ana.clara")).toBe("/perfil/ana.clara");
    expect(parsePostAuthRedirect("/configuracoes/conta")).toBe(
      ROUTE_PATHS.accountSettings,
    );
    expect(parsePostAuthRedirect("/configuracoes/seguranca")).toBe(
      ROUTE_PATHS.securitySettings,
    );
    expect(parsePostAuthRedirect("/configuracoes/termos")).toBe(ROUTE_PATHS.terms);
    expect(parsePostAuthRedirect("/configuracoes/privacidade")).toBe(ROUTE_PATHS.privacyPolicy);
    expect(parsePostAuthRedirect("/configuracoes/ajuda")).toBe(ROUTE_PATHS.help);
    expect(parsePostAuthRedirect("/configuracoes/contato")).toBe(ROUTE_PATHS.contact);
    expect(parsePostAuthRedirect("/denunciar/message/123e4567-e89b-42d3-a456-426614174000")).toBe(
      "/denunciar/message/123e4567-e89b-42d3-a456-426614174000",
    );
    expect(isReportTargetId("123e4567-e89b-42d3-a456-426614174000")).toBe(true);
    expect(isReportTargetId("abc-123")).toBe(false);
    expect(parsePostAuthRedirect("/denunciar/message/abc-123")).toBeUndefined();
    expect(parsePostAuthRedirect("/denunciar/unknown/abc-123")).toBeUndefined();
  });

  it("builds only UUID community and publication paths", () => {
    const communityId = "123e4567-e89b-42d3-a456-426614174000";
    const postId = "123e4567-e89b-42d3-a456-426614174001";
    expect(buildCommunityPath(communityId)).toBe(`/comunidade/${communityId}`);
    expect(buildCommunityPostPath(communityId, postId)).toBe(
      `/comunidade/${communityId}/publicacoes/${postId}`,
    );
    expect(() => buildCommunityPath("../admin")).toThrow("Comunidade inválida");
    expect(() => buildCommunityPostPath(communityId, "post-inválido")).toThrow(
      "Publicação inválida",
    );
  });

  it("derives moderation access only from the authenticated server role", () => {
    expect(canAccessModeration(authenticated)).toBe(false);
    expect(canAccessModeration({ ...authenticated, role: "support" })).toBe(false);
    expect(canAccessModeration({ ...authenticated, role: "moderator" })).toBe(true);
    expect(canAccessModeration({ ...authenticated, role: "admin" })).toBe(true);
    expect(canAccessModeration({ ...authenticated, role: "super_admin" })).toBe(true);
  });

  it("redirects a non-moderator away from the moderation route", async () => {
    const history = createMemoryHistory({ initialEntries: [ROUTE_PATHS.adminModeration] });
    const router = createAppRouter({ auth: authenticatedContext(), history });

    await router.load();
    expect(router.state.redirect?.options.to).toBe(ROUTE_PATHS.home);

    const moderatorRouter = createAppRouter({
      auth: authenticatedContext("moderator"),
      history: createMemoryHistory({ initialEntries: [ROUTE_PATHS.adminModeration] }),
    });
    await moderatorRouter.load();
    expect(moderatorRouter.state.redirect).toBeUndefined();
  });

  it("keeps account settings reachable while routing a restricted account away from the app", async () => {
    const accountRouter = createAppRouter({
      auth: authenticatedContext("user", "restricted"),
      history: createMemoryHistory({ initialEntries: [ROUTE_PATHS.accountSettings] }),
    });
    await accountRouter.load();
    expect(accountRouter.state.redirect).toBeUndefined();

    const homeRouter = createAppRouter({
      auth: authenticatedContext("user", "restricted"),
      history: createMemoryHistory({ initialEntries: [ROUTE_PATHS.home] }),
    });
    await homeRouter.load();
    expect(homeRouter.state.redirect?.options.to).toBe(ROUTE_PATHS.accountSettings);
  });

  it("maps Pages-base URLs to native sections and conversation ids", () => {
    expect(normalizeRouterBasePath("/social-orha/")).toBe("/social-orha");
    expect(getSectionFromPathname("/social-orha/comunidade", "/social-orha")).toBe(
      "comunidade",
    );
    expect(getSectionFromPathname("/social-orha/conversas/ana-clara", "/social-orha")).toBe(
      "conversas",
    );
    expect(getConversationIdFromPathname(
      "/social-orha/conversas/ana%20clara",
      "/social-orha",
    )).toBe("ana clara");
    expect(buildConversationPath("fé & conversa")).toBe(
      "/conversas/f%C3%A9%20%26%20conversa",
    );
  });

  it("keeps direct chat routes recoverable through back and forward history", async () => {
    const history = createMemoryHistory({ initialEntries: [ROUTE_PATHS.home] });
    const router = createAppRouter({ auth: authenticatedContext(), history });

    await router.load();
    await router.navigate({ to: ROUTE_PATHS.conversations });
    await router.navigate({
      to: ROUTE_PATHS.conversation,
      params: { conversationId: "ana-clara" },
    });
    expect(router.state.location.pathname).toBe("/conversas/ana-clara");

    router.history.back();
    await router.load();
    expect(router.state.location.pathname).toBe(ROUTE_PATHS.conversations);

    router.history.forward();
    await router.load();
    expect(router.state.location.pathname).toBe("/conversas/ana-clara");
  });

  it("preserves a protected Pages deep link while redirecting to auth", async () => {
    const history = createMemoryHistory({
      initialEntries: ["/social-orha/perfil"],
    });
    const router = createAppRouter({
      auth: signedOutContext(),
      basepath: "/social-orha",
      history,
    });

    await router.load();
    expect(router.state.redirect?.options.to).toBe(ROUTE_PATHS.signIn);
    expect(router.state.redirect?.options.search).toEqual({ redirect: "/perfil" });
    expect(router.buildLocation({
      to: ROUTE_PATHS.signIn,
      search: { redirect: "/perfil" },
    }).publicHref).toContain("/social-orha/auth/login");
  });

  it("keeps the original destination through a required onboarding", async () => {
    const history = createMemoryHistory({
      initialEntries: ["/social-orha/entrar?redirect=%2Fperfil"],
    });
    const router = createAppRouter({
      auth: onboardingContext(),
      basepath: "/social-orha",
      history,
    });

    await router.load();
    expect(router.state.redirect?.options.to).toBe(ROUTE_PATHS.onboarding);
    expect(router.state.redirect?.options.search).toEqual({ redirect: "/perfil" });
  });

  it("adds the Pages base when the entry guard restores an active session", async () => {
    const history = createMemoryHistory({
      initialEntries: ["/social-orha/"],
    });
    const router = createAppRouter({
      auth: authenticatedContext(),
      basepath: "/social-orha",
      history,
    });

    await router.load();
    expect(router.state.redirect?.options.to).toBe(ROUTE_PATHS.home);
    const resolvedRedirect = router.resolveRedirect(router.state.redirect!);
    expect(resolvedRedirect.options.href).toBe("/social-orha/inicio");
    expect(router.buildLocation({ to: ROUTE_PATHS.home }).publicHref).toBe(
      "/social-orha/inicio",
    );
  });

  it("ships a Pages 404 bridge before the application entrypoint", () => {
    const projectRoot = path.resolve(process.cwd());
    const fallback = readFileSync(path.join(projectRoot, "public", "404.html"), "utf8");
    const entry = readFileSync(path.join(projectRoot, "index.html"), "utf8");

    expect(fallback).toContain("/social-orha/");
    expect(fallback).toContain("__orha_route");
    expect(entry.indexOf("__orha_route")).toBeGreaterThan(-1);
    expect(entry.indexOf("__orha_route")).toBeLessThan(entry.indexOf("/src/main.tsx"));
  });

  it("ships a rewrite-capable production host contract for real deep links", () => {
    const projectRoot = path.resolve(process.cwd());
    const config = JSON.parse(
      readFileSync(path.join(projectRoot, "vercel.json"), "utf8"),
    ) as {
      outputDirectory?: string;
      rewrites?: Array<{ source?: string; destination?: string }>;
      headers?: Array<{ source?: string; headers?: Array<{ key?: string; value?: string }> }>;
    };

    expect(config.outputDirectory).toBe("dist");
    expect(config.rewrites).toContainEqual({ source: "/(.*)", destination: "/index.html" });
    expect(config.headers).toContainEqual(
      expect.objectContaining({
        source: "/sw.js",
        headers: expect.arrayContaining([
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ]),
      }),
    );
  });
});
