/* eslint-disable react-refresh/only-export-components -- Code-based routes and the registered router intentionally share this module. */
import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  type ReactNode,
} from "react";
import {
  Outlet,
  RouterProvider,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  notFound,
  redirect,
  useCanGoBack,
  useNavigate,
  useRouter,
  useRouterState,
  type RouterHistory,
} from "@tanstack/react-router";
import { Button } from "@/components/base/buttons/button";
import type { AuthContextValue } from "./auth/auth-context";
import { useAuth } from "./auth/auth-context";
import { AuthFlow, ResetPasswordScreen } from "./auth/auth-flow";
import {
  ROUTE_PATHS,
  LEGACY_AUTH_PATHS,
  buildCommunityPath,
  buildCommunityPostPath,
  canAccessGlobalRoleManagement,
  canAccessModeration,
  getAppPathFromPathname,
  getEntryRedirect,
  getOnboardingRedirect,
  getProtectedRedirect,
  getPublicAuthRedirect,
  getResetPasswordRedirect,
  isReportTargetId,
  isRouteUuid,
  normalizeRouterBasePath,
  parsePostAuthRedirect,
  toRouteAuthSnapshot,
  type RoutedAuthScreen,
} from "./router-policy";

const loadOnboardingFlow = () => import("./onboarding/onboarding-flow")
  .then((module) => ({ default: module.OnboardingFlow }));
const loadAuthenticatedApp = () => import("./authenticated-app")
  .then((module) => ({ default: module.AuthenticatedApp }));
const loadNotificationsPage = () => import("./pages/notifications-page")
  .then((module) => ({ default: module.NotificationsPage }));
const loadSettingsPage = () => import("./pages/settings-page")
  .then((module) => ({ default: module.SettingsPage }));
const loadSettingsInfoPages = () => import("./pages/settings-info-pages");
const loadReportPage = () => import("./pages/report-page")
  .then((module) => ({ default: module.ReportPage }));
const loadAdminModerationPage = () => import("./pages/admin-moderation-page")
  .then((module) => ({ default: module.AdminModerationPage }));
const loadAdminRolesPage = () => import("./pages/admin-roles-page")
  .then((module) => ({ default: module.AdminRolesPage }));
const loadSupportPage = () => import("./pages/support-page")
  .then((module) => ({ default: module.SupportPage }));
const loadPublicProfilePage = () => import("./pages/public-profile-page")
  .then((module) => ({ default: module.PublicProfilePage }));
const loadCommunityDetailPage = () => import("./pages/community-detail-page")
  .then((module) => ({ default: module.CommunityDetailPage }));
const OnboardingFlow = lazy(loadOnboardingFlow);
const AuthenticatedApp = lazy(loadAuthenticatedApp);
const NotificationsPage = lazy(loadNotificationsPage);
const SettingsPage = lazy(loadSettingsPage);
const TermsPage = lazy(() => loadSettingsInfoPages().then((module) => ({ default: module.TermsPage })));
const PrivacyPolicyPage = lazy(() => loadSettingsInfoPages().then((module) => ({ default: module.PrivacyPolicyPage })));
const HelpPage = lazy(() => loadSettingsInfoPages().then((module) => ({ default: module.HelpPage })));
const ContactPage = lazy(() => loadSettingsInfoPages().then((module) => ({ default: module.ContactPage })));
const ReportPage = lazy(loadReportPage);
const AdminModerationPage = lazy(loadAdminModerationPage);
const AdminRolesPage = lazy(loadAdminRolesPage);
const SupportPage = lazy(loadSupportPage);
const PublicProfilePage = lazy(loadPublicProfilePage);
const CommunityDetailPage = lazy(loadCommunityDetailPage);

export const ROUTER_BASE_PATH = normalizeRouterBasePath(import.meta.env.BASE_URL);

type RouterContext = {
  auth: AuthContextValue;
};

type AuthSearch = {
  redirect?: string;
};

type RouteFlowActions = {
  startWelcome: (destination?: string) => void;
};

const RouteFlowContext = createContext<RouteFlowActions | null>(null);

function useRouteFlow() {
  const value = useContext(RouteFlowContext);
  if (!value) throw new Error("O fluxo de rotas precisa estar dentro de AppRouter.");
  return value;
}

function validateAuthSearch(search: Record<string, unknown>): AuthSearch {
  return { redirect: parsePostAuthRedirect(search.redirect) };
}

function throwInternalRedirect(destination: string): never {
  throw redirect({ to: destination, replace: true });
}

function RootRoute() {
  return <Outlet />;
}

function LoadingRoute() {
  return <RouterLoadingScreen />;
}

function RouterLoadingScreen() {
  return (
    <div className="app-loading-screen" role="status" aria-label="Carregando ORHA">
      <img
        src={`${import.meta.env.BASE_URL}brand/orha-mark-transparent.png`}
        width="697"
        height="177"
        alt=""
        draggable={false}
      />
    </div>
  );
}

function LazyRoute({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouterLoadingScreen />}>{children}</Suspense>;
}

function AuthRoutePage({ screen }: { screen: RoutedAuthScreen }) {
  const navigate = useNavigate();
  const { startWelcome } = useRouteFlow();
  const search = useRouterState({ select: (state) => state.location.search }) as AuthSearch;

  const navigateAuth = useCallback((next: RoutedAuthScreen) => {
    const nextSearch: AuthSearch = { redirect: search.redirect };
    if (next === "sign_up") {
      void navigate({ to: ROUTE_PATHS.signUp, search: nextSearch });
      return;
    }
    if (next === "forgot") {
      void navigate({ to: ROUTE_PATHS.forgotPassword, search: nextSearch });
      return;
    }
    void navigate({ to: ROUTE_PATHS.signIn, search: nextSearch });
  }, [navigate, search.redirect]);

  return (
    <AuthFlow
      initialScreen={screen}
      onNavigate={navigateAuth}
      onSignedIn={() => startWelcome(search.redirect)}
    />
  );
}

function SignInRoutePage() {
  return <AuthRoutePage screen="sign_in" />;
}

function SignUpRoutePage() {
  return <AuthRoutePage screen="sign_up" />;
}

function ForgotPasswordRoutePage() {
  return <AuthRoutePage screen="forgot" />;
}

function ResetPasswordRoutePage() {
  const auth = useAuth();
  if (!auth.isPasswordRecovery) return <RouterLoadingScreen />;
  return <ResetPasswordScreen />;
}

function OnboardingRoutePage() {
  const auth = useAuth();
  const { startWelcome } = useRouteFlow();
  const search = onboardingRoute.useSearch();
  if (auth.status === "initializing" || auth.status === "loading_identity") {
    return <RouterLoadingScreen />;
  }
  return (
    <LazyRoute>
      <OnboardingFlow
        onFinished={() => startWelcome(search.redirect ?? ROUTE_PATHS.home)}
      />
    </LazyRoute>
  );
}

function AuthenticatedRouteLayout() {
  const auth = useAuth();
  if (auth.status !== "ready" || !auth.identity?.profile.onboarding_completed_at) {
    return <RouterLoadingScreen />;
  }
  return (
    <LazyRoute>
      <Outlet />
    </LazyRoute>
  );
}

function AuthenticatedShellRoutePage() {
  return <AuthenticatedApp />;
}

function useRouteBack(fallback: string) {
  const canGoBack = useCanGoBack();
  const router = useRouter();

  return useCallback(() => {
    if (canGoBack) {
      router.history.back();
      return;
    }
    void navigateToAppPath(fallback, true);
  }, [canGoBack, fallback, router.history]);
}

function NotificationsRoutePage() {
  const goBack = useRouteBack(ROUTE_PATHS.home);
  return (
    <NotificationsPage
      onBack={goBack}
      onNavigate={(path) => void navigateToAppPath(path, false)}
    />
  );
}

function SettingsRoutePage({
  initialSection,
}: {
  initialSection?: "account" | "security";
}) {
  const goBack = useRouteBack(ROUTE_PATHS.profile);
  const navigate = useNavigate();
  return (
    <SettingsPage
      initialSection={initialSection}
      onBack={goBack}
      onNavigate={(path) => void navigateToAppPath(path, false)}
      onSignedOut={() => void navigate({ to: ROUTE_PATHS.entry, replace: true })}
    />
  );
}

function TermsRoutePage() {
  const goBack = useRouteBack(ROUTE_PATHS.settings);
  return (
    <TermsPage
      onBack={goBack}
      onNavigate={(path) => void navigateToAppPath(path, false)}
    />
  );
}

function PrivacyPolicyRoutePage() {
  const goBack = useRouteBack(ROUTE_PATHS.settings);
  return (
    <PrivacyPolicyPage
      onBack={goBack}
      onNavigate={(path) => void navigateToAppPath(path, false)}
    />
  );
}

function HelpRoutePage() {
  const goBack = useRouteBack(ROUTE_PATHS.settings);
  return (
    <HelpPage
      onBack={goBack}
      onNavigate={(path) => void navigateToAppPath(path, false)}
    />
  );
}

function ContactRoutePage() {
  const goBack = useRouteBack(ROUTE_PATHS.settings);
  return (
    <ContactPage
      onBack={goBack}
      onOpenSupport={() => void navigateToAppPath(ROUTE_PATHS.support, false)}
    />
  );
}

function SupportRoutePage() {
  const auth = useAuth();
  const goBack = useRouteBack(ROUTE_PATHS.settings);
  if (!auth.identity) return <RouterLoadingScreen />;
  return <SupportPage identity={auth.identity} onBack={goBack} />;
}

const reportTargetLabels = {
  profile: "Perfil",
  community: "Comunidade",
  community_post: "Publicação",
  post_comment: "Comentário",
  message: "Mensagem",
} as const;

function isReportTargetType(value: string): value is keyof typeof reportTargetLabels {
  return Object.hasOwn(reportTargetLabels, value);
}

function ReportRoutePage() {
  const { targetType, targetId } = reportRoute.useParams();
  const goBack = useRouteBack(ROUTE_PATHS.home);
  if (!isReportTargetType(targetType)) return <NotFoundRoute />;
  return (
    <ReportPage
      targetType={targetType}
      targetId={targetId}
      targetLabel={reportTargetLabels[targetType]}
      onBack={goBack}
      onSubmitted={goBack}
    />
  );
}

function AdminModerationRoutePage() {
  const auth = useAuth();
  const goBack = useRouteBack(ROUTE_PATHS.home);
  if (!auth.identity) return <RouterLoadingScreen />;
  return <AdminModerationPage role={auth.identity.role} onBack={goBack} />;
}

function AdminRolesRoutePage() {
  const auth = useAuth();
  const goBack = useRouteBack(ROUTE_PATHS.home);
  if (!auth.identity) return <RouterLoadingScreen />;
  return <AdminRolesPage identity={auth.identity} onBack={goBack} />;
}

function PublicProfileRoutePage() {
  const { username } = publicProfileRoute.useParams();
  const goBack = useRouteBack(ROUTE_PATHS.home);
  const navigate = useNavigate();
  return (
    <PublicProfilePage
      username={username}
      onBack={goBack}
      onNavigate={(path) => void navigateToAppPath(path, false)}
      onOpenOwnProfile={() => void navigate({ to: ROUTE_PATHS.profile })}
    />
  );
}

function CommunityDetailRoutePage() {
  const { communityId } = communityDetailRoute.useParams();
  const goBack = useRouteBack(ROUTE_PATHS.community);
  return (
    <CommunityDetailPage
      communityId={communityId}
      onBack={goBack}
      onNavigate={(path) => void navigateToAppPath(path, false)}
      onOpenPost={(post) => void navigateToAppPath(
        buildCommunityPostPath(communityId, post.id),
        false,
      )}
      onOpenProfile={(username) => void navigateToAppPath(
        `${ROUTE_PATHS.profile}/${encodeURIComponent(username)}`,
        false,
      )}
    />
  );
}

function CommunityPostRoutePage() {
  const { communityId, postId } = communityPostRoute.useParams();
  const goBack = useRouteBack(buildCommunityPath(communityId));
  return (
    <CommunityDetailPage
      communityId={communityId}
      initialPostId={postId}
      onBack={goBack}
      onCloseInitialPost={() => void navigateToAppPath(buildCommunityPath(communityId), true)}
      onNavigate={(path) => void navigateToAppPath(path, false)}
      onOpenPost={(post) => void navigateToAppPath(
        buildCommunityPostPath(communityId, post.id),
        false,
      )}
      onOpenProfile={(username) => void navigateToAppPath(
        `${ROUTE_PATHS.profile}/${encodeURIComponent(username)}`,
        false,
      )}
    />
  );
}

function NotFoundRoute() {
  const auth = useAuth();
  const navigate = useNavigate();
  const canEnterApp = auth.status === "ready"
    && Boolean(auth.identity?.profile.onboarding_completed_at)
    && auth.identity?.moderationState.status === "active"
    && auth.identity?.moderationState.access_enabled === true
    && !auth.isPasswordRecovery;

  return (
    <main className="session-error-screen">
      <span>CAMINHO NÃO ENCONTRADO</span>
      <h1>Essa tela não existe.</h1>
      <p>O restante do ORHA continua intacto. Volte para um caminho seguro.</p>
      <Button
        className="auth-primary-button"
        size="xl"
        onPress={() => void navigate({
          to: canEnterApp ? ROUTE_PATHS.home : ROUTE_PATHS.signIn,
          replace: true,
        })}
      >
        {canEnterApp ? "Ir para o início" : "Ir para o acesso"}
      </Button>
    </main>
  );
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: RootRoute,
  notFoundComponent: NotFoundRoute,
});

const entryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: ROUTE_PATHS.entry,
  beforeLoad: ({ context }) => {
    const destination = getEntryRedirect(toRouteAuthSnapshot(context.auth));
    if (destination) throwInternalRedirect(destination);
  },
  component: LoadingRoute,
});

function createPublicAuthRoute(
  path:
    | typeof ROUTE_PATHS.signIn
    | typeof ROUTE_PATHS.signUp
    | typeof ROUTE_PATHS.forgotPassword
    | typeof LEGACY_AUTH_PATHS.signIn
    | typeof LEGACY_AUTH_PATHS.signUp
    | typeof LEGACY_AUTH_PATHS.forgotPassword,
  component: () => ReactNode,
) {
  return createRoute({
    getParentRoute: () => rootRoute,
    path,
    validateSearch: validateAuthSearch,
    beforeLoad: ({ context, search }) => {
      const destination = getPublicAuthRedirect(
        toRouteAuthSnapshot(context.auth),
        search.redirect,
      );
      if (destination === ROUTE_PATHS.onboarding && search.redirect) {
        throw redirect({
          to: ROUTE_PATHS.onboarding,
          search: { redirect: search.redirect },
          replace: true,
        });
      }
      if (destination) throwInternalRedirect(destination);
    },
    component,
  });
}

const signInRoute = createPublicAuthRoute(ROUTE_PATHS.signIn, SignInRoutePage);
const signUpRoute = createPublicAuthRoute(ROUTE_PATHS.signUp, SignUpRoutePage);
const forgotPasswordRoute = createPublicAuthRoute(
  ROUTE_PATHS.forgotPassword,
  ForgotPasswordRoutePage,
);
const legacySignInRoute = createPublicAuthRoute(
  LEGACY_AUTH_PATHS.signIn,
  SignInRoutePage,
);
const legacySignUpRoute = createPublicAuthRoute(
  LEGACY_AUTH_PATHS.signUp,
  SignUpRoutePage,
);
const legacyForgotPasswordRoute = createPublicAuthRoute(
  LEGACY_AUTH_PATHS.forgotPassword,
  ForgotPasswordRoutePage,
);

const resetPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: ROUTE_PATHS.resetPassword,
  beforeLoad: ({ context }) => {
    const destination = getResetPasswordRedirect(toRouteAuthSnapshot(context.auth));
    if (destination) throwInternalRedirect(destination);
  },
  component: ResetPasswordRoutePage,
});
const legacyResetPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: LEGACY_AUTH_PATHS.resetPassword,
  beforeLoad: ({ context }) => {
    const destination = getResetPasswordRedirect(toRouteAuthSnapshot(context.auth));
    if (destination) throwInternalRedirect(destination);
  },
  component: ResetPasswordRoutePage,
});

const onboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: ROUTE_PATHS.onboarding,
  validateSearch: validateAuthSearch,
  beforeLoad: ({ context, search }) => {
    const destination = getOnboardingRedirect(
      toRouteAuthSnapshot(context.auth),
      search.redirect,
    );
    if (destination === ROUTE_PATHS.signIn && search.redirect) {
      throw redirect({
        to: ROUTE_PATHS.signIn,
        search: { redirect: search.redirect },
        replace: true,
      });
    }
    if (destination) throwInternalRedirect(destination);
  },
  component: OnboardingRoutePage,
});

const authenticatedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "_authenticated",
  beforeLoad: ({ context, location }) => {
    const requested = parsePostAuthRedirect(
      getAppPathFromPathname(location.pathname, ROUTER_BASE_PATH),
    );
    const destination = getProtectedRedirect(
      toRouteAuthSnapshot(context.auth),
      requested,
    );
    if (!destination) return;
    if (destination === ROUTE_PATHS.signIn) {
      throw redirect({
        to: ROUTE_PATHS.signIn,
        search: { redirect: requested },
        replace: true,
      });
    }
    if (destination === ROUTE_PATHS.onboarding) {
      throw redirect({
        to: ROUTE_PATHS.onboarding,
        search: { redirect: requested },
        replace: true,
      });
    }
    throwInternalRedirect(destination);
  },
  component: AuthenticatedRouteLayout,
});

const homeRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: ROUTE_PATHS.home,
  component: AuthenticatedShellRoutePage,
});
const communityRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: ROUTE_PATHS.community,
  component: AuthenticatedShellRoutePage,
});
const communityDetailRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: ROUTE_PATHS.communityDetail,
  beforeLoad: ({ params }) => {
    if (!isRouteUuid(params.communityId)) throw notFound();
  },
  component: CommunityDetailRoutePage,
});
const communityPostRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: ROUTE_PATHS.communityPost,
  beforeLoad: ({ params }) => {
    if (!isRouteUuid(params.communityId) || !isRouteUuid(params.postId)) throw notFound();
  },
  component: CommunityPostRoutePage,
});
const exploreRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: ROUTE_PATHS.explore,
  component: AuthenticatedShellRoutePage,
});
const conversationsRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: ROUTE_PATHS.conversations,
  component: AuthenticatedShellRoutePage,
});
const conversationRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: ROUTE_PATHS.conversation,
  component: AuthenticatedShellRoutePage,
});
const profileRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: ROUTE_PATHS.profile,
  component: AuthenticatedShellRoutePage,
});
const publicProfileRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: ROUTE_PATHS.publicProfile,
  component: PublicProfileRoutePage,
});
const notificationsRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: ROUTE_PATHS.notifications,
  component: NotificationsRoutePage,
});
const settingsRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: ROUTE_PATHS.settings,
  component: SettingsRoutePage,
});
const accountSettingsRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: ROUTE_PATHS.accountSettings,
  component: () => <SettingsRoutePage initialSection="account" />,
});
const securitySettingsRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: ROUTE_PATHS.securitySettings,
  component: () => <SettingsRoutePage initialSection="security" />,
});
const termsRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: ROUTE_PATHS.terms,
  component: TermsRoutePage,
});
const privacyPolicyRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: ROUTE_PATHS.privacyPolicy,
  component: PrivacyPolicyRoutePage,
});
const helpRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: ROUTE_PATHS.help,
  component: HelpRoutePage,
});
const contactRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: ROUTE_PATHS.contact,
  component: ContactRoutePage,
});
const reportRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: ROUTE_PATHS.report,
  beforeLoad: ({ params }) => {
    if (!isReportTargetType(params.targetType) || !isReportTargetId(params.targetId)) {
      throw notFound();
    }
  },
  component: ReportRoutePage,
});
const adminModerationRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: ROUTE_PATHS.adminModeration,
  beforeLoad: ({ context }) => {
    if (!canAccessModeration(toRouteAuthSnapshot(context.auth))) {
      throw redirect({ to: ROUTE_PATHS.home, replace: true });
    }
  },
  component: AdminModerationRoutePage,
});
const adminRolesRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: ROUTE_PATHS.adminRoles,
  beforeLoad: ({ context }) => {
    if (!canAccessGlobalRoleManagement(toRouteAuthSnapshot(context.auth))) {
      throw redirect({ to: ROUTE_PATHS.home, replace: true });
    }
  },
  component: AdminRolesRoutePage,
});
const supportRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: ROUTE_PATHS.support,
  component: SupportRoutePage,
});

export const routeTree = rootRoute.addChildren([
  entryRoute,
  signInRoute,
  signUpRoute,
  forgotPasswordRoute,
  resetPasswordRoute,
  legacySignInRoute,
  legacySignUpRoute,
  legacyForgotPasswordRoute,
  legacyResetPasswordRoute,
  onboardingRoute,
  authenticatedRoute.addChildren([
    homeRoute,
    communityRoute,
    communityDetailRoute,
    communityPostRoute,
    exploreRoute,
    conversationsRoute,
    conversationRoute,
    profileRoute,
    publicProfileRoute,
    notificationsRoute,
    settingsRoute,
    accountSettingsRoute,
    securitySettingsRoute,
    termsRoute,
    privacyPolicyRoute,
    helpRoute,
    contactRoute,
    reportRoute,
    adminModerationRoute,
    adminRolesRoute,
    supportRoute,
  ]),
]);

export function createAppRouter({
  auth,
  basepath = ROUTER_BASE_PATH,
  history,
  isServer,
}: {
  auth?: AuthContextValue;
  basepath?: string;
  history?: RouterHistory;
  isServer?: boolean;
} = {}) {
  return createRouter({
    routeTree,
    basepath,
    history,
    isServer,
    context: { auth: auth ?? (null as unknown as AuthContextValue) },
    defaultPreload: "intent",
    defaultPreloadStaleTime: 30_000,
    notFoundMode: "root",
  });
}

export const appRouter = createAppRouter();

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof appRouter;
  }
}

export function AppRouter({
  auth,
  startWelcome,
}: {
  auth: AuthContextValue;
  startWelcome: (destination?: string) => void;
}) {
  useEffect(() => {
    void appRouter.invalidate();
  }, [
    auth.status,
    auth.isPasswordRecovery,
    auth.identity?.profile.onboarding_completed_at,
    auth.identity?.moderationState.status,
    auth.identity?.moderationState.access_enabled,
    auth.identity?.role,
  ]);

  return (
    <RouteFlowContext.Provider value={{ startWelcome }}>
      <RouterProvider router={appRouter} context={{ auth }} />
    </RouteFlowContext.Provider>
  );
}

export function preloadAuthenticatedRoute() {
  return loadAuthenticatedApp();
}

export function preloadAuthenticatedUtilities() {
  return Promise.all([
    loadNotificationsPage(),
    loadSettingsPage(),
    loadSettingsInfoPages(),
    loadReportPage(),
    loadAdminModerationPage(),
    loadAdminRolesPage(),
    loadSupportPage(),
  ]);
}

export function preloadOnboardingRoute() {
  return loadOnboardingFlow();
}

export function navigateToAppPath(destination?: string, replace = true) {
  const safeDestination = parsePostAuthRedirect(destination) ?? ROUTE_PATHS.home;
  return appRouter.navigate({ to: safeDestination, replace });
}
