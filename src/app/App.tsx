import { useCallback, useEffect, useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { Button } from "@/components/base/buttons/button";
import { signOut } from "@/infrastructure/supabase/email-auth";
import { applyPwaUpdateWithDraft } from "@/infrastructure/pwa/pwa-update-draft";
import { useAuth } from "./auth/auth-context";
import { AuthProvider } from "./auth/auth-provider";
import { SplashScreen } from "./components/splash-screen";
import { WelcomeScreen } from "./components/welcome-screen";
import {
  AppRouter,
  navigateToAppPath,
  preloadAuthenticatedRoute,
  preloadAuthenticatedUtilities,
  preloadOnboardingRoute,
} from "./router";
import { ROUTE_PATHS, parsePostAuthRedirect } from "./router-policy";
import { AppRuntimeProviders } from "./app-runtime-providers";
import { useBrowserOnline, usePwaUpdateDraftRestoration } from "./pwa-runtime";
import { AnalyticsProvider } from "./analytics/analytics-provider";

export function App() {
  return (
    <AppRuntimeProviders>
      <AuthProvider>
        <AnalyticsProvider>
          <div className="device-stage">
            <div className="native-app-shell">
              <AppGate />
              <PwaRuntimeNotices />
            </div>
          </div>
        </AnalyticsProvider>
      </AuthProvider>
    </AppRuntimeProviders>
  );
}

function PwaRuntimeNotices() {
  const auth = useAuth();
  const isOnline = useBrowserOnline();
  return (
    <div className="pwa-runtime-notices">
      {!isOnline && auth.status !== "error" ? (
        <aside className="pwa-offline-notice" role="status" aria-live="polite">
          <strong>Sem conexão</strong>
          <span>O que já está na tela continua visível. Novos dados e alterações exigem internet.</span>
        </aside>
      ) : null}
      <PwaUpdateNotice />
    </div>
  );
}

function PwaUpdateNotice() {
  const auth = useAuth();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  usePwaUpdateDraftRestoration({ authStatus: auth.status, userId: auth.user?.id });

  if (!needRefresh && !offlineReady) return null;

  const applyUpdate = async () => {
    setUpdating(true);
    setUpdateError(null);
    try {
      await applyPwaUpdateWithDraft({
        userId: auth.user?.id,
        updateServiceWorker,
      });
    } catch {
      setUpdating(false);
      setUpdateError("Não foi possível atualizar agora. Seu trabalho continua nesta versão.");
    }
  };

  return (
    <aside className="pwa-update-notice" aria-live="polite" aria-atomic="true">
      <div>
        <strong>{needRefresh ? "Uma nova versão está pronta" : "ORHA instalada"}</strong>
        <span>
          {needRefresh
            ? "Atualize quando terminar o que está fazendo."
            : "Sem internet, apenas a estrutura abre; dados privados e ações exigem conexão."}
        </span>
        {updateError ? <span role="alert">{updateError}</span> : null}
      </div>
      <div className="pwa-update-actions">
        {needRefresh ? (
          <Button size="sm" isDisabled={updating} onPress={() => void applyUpdate()}>
            {updating ? "Atualizando" : "Atualizar"}
          </Button>
        ) : null}
        <Button
          size="sm"
          color="secondary"
          onPress={() => {
            setNeedRefresh(false);
            setOfflineReady(false);
          }}
        >
          {needRefresh ? "Depois" : "Entendi"}
        </Button>
      </div>
    </aside>
  );
}

function AppGate() {
  const auth = useAuth();
  const { status, identity, session, isPasswordRecovery, error, refreshIdentity } = auth;
  const isOnline = useBrowserOnline();
  const wasOnline = useRef(isOnline);
  const [splashFinished, setSplashFinished] = useState(false);
  const [welcomePending, setWelcomePending] = useState(false);
  const [welcomeDestination, setWelcomeDestination] = useState<string>(ROUTE_PATHS.home);
  const finishLaunch = useCallback(() => setSplashFinished(true), []);
  const startWelcome = useCallback((destination?: string) => {
    setWelcomeDestination(parsePostAuthRedirect(destination) ?? ROUTE_PATHS.home);
    setWelcomePending(true);
  }, []);
  const finishWelcome = useCallback(() => {
    void navigateToAppPath(welcomeDestination, true);
    setWelcomePending(false);
  }, [welcomeDestination]);
  const sessionReady = status !== "initializing" && status !== "loading_identity";
  const shouldShowWelcome = welcomePending
    && status === "ready"
    && Boolean(identity?.profile.onboarding_completed_at)
    && !isPasswordRecovery;

  useEffect(() => {
    if (status !== "ready") return;
    if (identity?.profile.onboarding_completed_at) {
      void preloadAuthenticatedRoute();
      void preloadAuthenticatedUtilities();
      return;
    }
    void preloadOnboardingRoute();
  }, [identity?.profile.onboarding_completed_at, status]);

  useEffect(() => {
    const reconnected = !wasOnline.current && isOnline;
    wasOnline.current = isOnline;
    if (reconnected && status === "error" && session) void refreshIdentity();
  }, [isOnline, refreshIdentity, session, status]);

  if (!splashFinished) {
    return <SplashScreen ready={sessionReady} onFinished={finishLaunch} />;
  }

  if (status === "error") {
    if (!isOnline) {
      return (
        <div className="session-error-screen offline-session-screen" data-offline-boundary="private-data">
          <span>Sem conexão</span>
          <h1>Seus dados privados não ficam presos no cache.</h1>
          <p>
            A estrutura da ORHA abriu, mas perfil, conversas e comunidades precisam de internet.
            Retomaremos sua sessão automaticamente quando a conexão voltar.
          </p>
          <Button className="auth-primary-button" size="xl" isDisabled>
            Aguardando conexão
          </Button>
        </div>
      );
    }
    return (
      <div className="session-error-screen">
        <span>Não conseguimos abrir sua conta</span>
        <h1>Sua sessão está segura.</h1>
        <p>{error}</p>
        <Button className="auth-primary-button" size="xl" onPress={() => void refreshIdentity()}>Tentar novamente</Button>
        <button type="button" className="auth-text-action" onClick={() => void signOut()}>Sair desta conta</button>
      </div>
    );
  }

  if (shouldShowWelcome) return <WelcomeScreen onFinished={finishWelcome} />;
  return <AppRouter auth={auth} startWelcome={startWelcome} />;
}
