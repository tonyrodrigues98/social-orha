import type { AuthContextValue, AuthStatus } from "./auth/auth-context";
import type { AppRole, ProfileAccountStatus } from "@/domain/identity";
import type { AppSection } from "./types";
import { SETTINGS_INFO_PATHS } from "./settings/settings-info-routes";

export const ROUTE_PATHS = {
  entry: "/",
  signIn: "/auth/login",
  signUp: "/auth/signup",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  onboarding: "/onboarding",
  home: "/inicio",
  community: "/comunidade",
  communityDetail: "/comunidade/$communityId",
  communityPost: "/comunidade/$communityId/publicacoes/$postId",
  explore: "/explorar",
  conversations: "/conversas",
  conversation: "/conversas/$conversationId",
  profile: "/perfil",
  notifications: "/notificacoes",
  settings: "/configuracoes",
  accountSettings: "/configuracoes/conta",
  securitySettings: "/configuracoes/seguranca",
  terms: SETTINGS_INFO_PATHS.terms,
  privacyPolicy: SETTINGS_INFO_PATHS.privacy,
  help: SETTINGS_INFO_PATHS.help,
  contact: SETTINGS_INFO_PATHS.contact,
  publicProfile: "/perfil/$username",
  report: "/denunciar/$targetType/$targetId",
  adminModeration: "/admin/moderacao",
  adminRoles: "/admin/funcoes",
  support: "/suporte",
} as const;

export const LEGACY_AUTH_PATHS = {
  signIn: "/entrar",
  signUp: "/cadastro",
  forgotPassword: "/recuperar-senha",
  resetPassword: "/redefinir-senha",
} as const;

export const SECTION_PATHS: Record<AppSection, string> = {
  inicio: ROUTE_PATHS.home,
  comunidade: ROUTE_PATHS.community,
  explorar: ROUTE_PATHS.explore,
  conversas: ROUTE_PATHS.conversations,
  perfil: ROUTE_PATHS.profile,
};

export const ROUTED_AUTH_SCREEN_PATHS = {
  sign_in: ROUTE_PATHS.signIn,
  sign_up: ROUTE_PATHS.signUp,
  forgot: ROUTE_PATHS.forgotPassword,
} as const;

export type RoutedAuthScreen = keyof typeof ROUTED_AUTH_SCREEN_PATHS;

export type RouteAuthSnapshot = {
  status: AuthStatus;
  isPasswordRecovery: boolean;
  onboardingCompleted: boolean;
  role: AppRole | null;
  accountStatus: ProfileAccountStatus | null;
  accountAccessEnabled: boolean | null;
};

export function toRouteAuthSnapshot(auth: AuthContextValue): RouteAuthSnapshot {
  return {
    status: auth.status,
    isPasswordRecovery: auth.isPasswordRecovery,
    onboardingCompleted: Boolean(auth.identity?.profile.onboarding_completed_at),
    role: auth.identity?.role ?? null,
    accountStatus: auth.identity?.moderationState.status ?? null,
    accountAccessEnabled: auth.identity?.moderationState.access_enabled ?? null,
  };
}

const moderationRoles: readonly AppRole[] = ["super_admin", "admin", "moderator"];
const globalRoleManagerRoles: readonly AppRole[] = ["super_admin", "admin"];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isRouteUuid(value: string): boolean {
  return uuidPattern.test(value);
}

export function isReportTargetId(value: string): boolean {
  return isRouteUuid(value);
}

function decodedRouteUuid(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const decoded = decodeURIComponent(value);
    return isRouteUuid(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

export function canAccessModeration(auth: RouteAuthSnapshot): boolean {
  return auth.status === "ready"
    && auth.onboardingCompleted
    && auth.accountStatus === "active"
    && auth.accountAccessEnabled === true
    && auth.role !== null
    && moderationRoles.includes(auth.role);
}

export function canAccessGlobalRoleManagement(auth: RouteAuthSnapshot): boolean {
  return auth.status === "ready"
    && auth.onboardingCompleted
    && auth.accountStatus === "active"
    && auth.accountAccessEnabled === true
    && auth.role !== null
    && globalRoleManagerRoles.includes(auth.role);
}

function authIsBusy(auth: RouteAuthSnapshot) {
  return auth.status === "initializing" || auth.status === "loading_identity";
}

function accountCanEnterApp(auth: RouteAuthSnapshot) {
  return auth.accountStatus === "active" && auth.accountAccessEnabled === true;
}

function authenticatedDestination(auth: RouteAuthSnapshot, requested?: unknown) {
  if (!auth.onboardingCompleted) return ROUTE_PATHS.onboarding;
  if (!accountCanEnterApp(auth)) return ROUTE_PATHS.accountSettings;
  return parsePostAuthRedirect(requested) ?? ROUTE_PATHS.home;
}

/** Returns `null` while the auth provider is still resolving the session. */
export function getEntryRedirect(auth: RouteAuthSnapshot): string | null {
  if (auth.isPasswordRecovery) return ROUTE_PATHS.resetPassword;
  if (authIsBusy(auth) || auth.status === "error") return null;
  if (auth.status === "signed_out") return ROUTE_PATHS.signIn;
  return authenticatedDestination(auth);
}

/** Redirect used by login, registration and password-recovery pages. */
export function getPublicAuthRedirect(
  auth: RouteAuthSnapshot,
  requested?: unknown,
): string | null {
  if (auth.isPasswordRecovery) return ROUTE_PATHS.resetPassword;
  if (authIsBusy(auth) || auth.status === "error" || auth.status === "signed_out") {
    return null;
  }
  return authenticatedDestination(auth, requested);
}

/** Redirect used by every route that requires a completed authenticated account. */
export function getProtectedRedirect(
  auth: RouteAuthSnapshot,
  requested?: unknown,
): string | null {
  if (auth.isPasswordRecovery) return ROUTE_PATHS.resetPassword;
  if (authIsBusy(auth) || auth.status === "error") return null;
  if (auth.status === "signed_out") return ROUTE_PATHS.signIn;
  if (!auth.onboardingCompleted) return ROUTE_PATHS.onboarding;
  const safeRequested = parsePostAuthRedirect(requested);
  const restrictedAccountPaths: readonly string[] = [
    ROUTE_PATHS.accountSettings,
    ROUTE_PATHS.terms,
    ROUTE_PATHS.privacyPolicy,
    ROUTE_PATHS.help,
    ROUTE_PATHS.contact,
  ];
  if (
    !accountCanEnterApp(auth)
    && (!safeRequested || !restrictedAccountPaths.includes(safeRequested))
  ) {
    return ROUTE_PATHS.accountSettings;
  }
  return null;
}

export function getOnboardingRedirect(
  auth: RouteAuthSnapshot,
  requested?: unknown,
): string | null {
  if (auth.isPasswordRecovery) return ROUTE_PATHS.resetPassword;
  if (authIsBusy(auth) || auth.status === "error") return null;
  if (auth.status === "signed_out") return ROUTE_PATHS.signIn;
  if (auth.onboardingCompleted) {
    return authenticatedDestination(auth, requested);
  }
  return null;
}

export function getResetPasswordRedirect(auth: RouteAuthSnapshot): string | null {
  if (auth.isPasswordRecovery || authIsBusy(auth) || auth.status === "error") {
    return null;
  }
  if (auth.status === "signed_out") return ROUTE_PATHS.signIn;
  return authenticatedDestination(auth);
}

/**
 * Only app-owned, authenticated destinations are accepted. Origin changes,
 * protocol-relative values, auth loops and arbitrary pages are discarded.
 */
export function parsePostAuthRedirect(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return undefined;
  }

  try {
    const parsed = new URL(value, "https://orha.invalid");
    if (parsed.origin !== "https://orha.invalid") return undefined;

    const pathname = parsed.pathname.replace(/\/$/, "") || "/";
    const isSection = Object.values(SECTION_PATHS).includes(pathname);
    const utilityPaths: readonly string[] = [
      ROUTE_PATHS.notifications,
      ROUTE_PATHS.settings,
      ROUTE_PATHS.accountSettings,
      ROUTE_PATHS.securitySettings,
      ROUTE_PATHS.terms,
      ROUTE_PATHS.privacyPolicy,
      ROUTE_PATHS.help,
      ROUTE_PATHS.contact,
      ROUTE_PATHS.adminModeration,
      ROUTE_PATHS.adminRoles,
      ROUTE_PATHS.support,
    ];
    const isUtilityRoute = utilityPaths.includes(pathname);
    const isConversation = /^\/conversas\/[^/]+$/.test(pathname);
    const communityMatch = /^\/comunidade\/([^/]+)$/.exec(pathname);
    const communityPostMatch = /^\/comunidade\/([^/]+)\/publicacoes\/([^/]+)$/.exec(pathname);
    const isCommunity = decodedRouteUuid(communityMatch?.[1]) !== null;
    const isCommunityPost = decodedRouteUuid(communityPostMatch?.[1]) !== null
      && decodedRouteUuid(communityPostMatch?.[2]) !== null;
    const isPublicProfile = /^\/perfil\/[^/]+$/.test(pathname);
    const reportMatch = /^\/denunciar\/(?:profile|community|community_post|post_comment|message)\/([^/]+)$/.exec(pathname);
    const isReport = Boolean(reportMatch?.[1] && isReportTargetId(reportMatch[1]));
    return isSection || isUtilityRoute || isConversation || isCommunity || isCommunityPost || isPublicProfile || isReport
      ? pathname
      : undefined;
  } catch {
    return undefined;
  }
}

export function normalizeRouterBasePath(baseUrl: string): string {
  const pathname = new URL(baseUrl, "https://orha.invalid").pathname;
  if (pathname === "/") return "/";
  return `/${pathname.split("/").filter(Boolean).join("/")}`;
}

export function getAppPathFromPathname(pathname: string, basePath = "/") {
  const pathOnly = pathname.split(/[?#]/, 1)[0] || "/";
  const normalizedBase = normalizeRouterBasePath(basePath);
  if (normalizedBase === "/") return pathOnly;
  if (pathOnly === normalizedBase) return "/";
  if (pathOnly.startsWith(`${normalizedBase}/`)) {
    return pathOnly.slice(normalizedBase.length) || "/";
  }
  return pathOnly;
}

export function getSectionFromPathname(pathname: string, basePath = "/"): AppSection {
  const appPath = getAppPathFromPathname(pathname, basePath);
  const segment = appPath.split("/").filter(Boolean)[0];
  if (segment === "comunidade" || segment === "explorar" || segment === "conversas" || segment === "perfil") {
    return segment;
  }
  return "inicio";
}

export function getConversationIdFromPathname(pathname: string, basePath = "/"): string | null {
  const appPath = getAppPathFromPathname(pathname, basePath).replace(/\/$/, "");
  const match = /^\/conversas\/([^/]+)$/.exec(appPath);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function buildConversationPath(conversationId: string) {
  return `${ROUTE_PATHS.conversations}/${encodeURIComponent(conversationId)}`;
}

export function buildCommunityPath(communityId: string) {
  if (!isRouteUuid(communityId)) throw new Error("Comunidade inválida.");
  return `${ROUTE_PATHS.community}/${encodeURIComponent(communityId)}`;
}

export function buildCommunityPostPath(communityId: string, postId: string) {
  if (!isRouteUuid(communityId)) throw new Error("Comunidade inválida.");
  if (!isRouteUuid(postId)) throw new Error("Publicação inválida.");
  return `${buildCommunityPath(communityId)}/publicacoes/${encodeURIComponent(postId)}`;
}
