import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { Button } from "@/components/base/buttons/button";
import { signOut } from "@/infrastructure/supabase/email-auth";
import { useAuth } from "./auth/auth-context";
import { AuthProvider } from "./auth/auth-provider";
import { AuthFlow, ResetPasswordScreen } from "./auth/auth-flow";
import { SplashScreen } from "./components/splash-screen";
import { WelcomeScreen } from "./components/welcome-screen";

const loadOnboardingFlow = () => import("./onboarding/onboarding-flow").then((module) => ({ default: module.OnboardingFlow }));
const loadAuthenticatedApp = () => import("./authenticated-app").then((module) => ({ default: module.AuthenticatedApp }));
const OnboardingFlow = lazy(loadOnboardingFlow);
const AuthenticatedApp = lazy(loadAuthenticatedApp);

export function App() {
  return (
    <AuthProvider>
      <div className="device-stage">
        <div className="native-app-shell">
          <AppGate />
          <PwaUpdateNotice />
        </div>
      </div>
    </AuthProvider>
  );
}

function PwaUpdateNotice() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh && !offlineReady) return null;

  return (
    <aside className="pwa-update-notice" aria-live="polite" aria-atomic="true">
      <div>
        <strong>{needRefresh ? "Uma nova versão está pronta" : "ORHA disponível offline"}</strong>
        <span>
          {needRefresh
            ? "Atualize quando terminar o que está fazendo."
            : "As telas essenciais já podem abrir sem conexão."}
        </span>
      </div>
      <div className="pwa-update-actions">
        {needRefresh ? (
          <Button size="sm" onPress={() => void updateServiceWorker(true)}>
            Atualizar
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
  const { status, identity, isPasswordRecovery, error, refreshIdentity } = useAuth();
  const [splashFinished, setSplashFinished] = useState(false);
  const [welcomePending, setWelcomePending] = useState(false);
  const finishLaunch = useCallback(() => setSplashFinished(true), []);
  const startWelcome = useCallback(() => setWelcomePending(true), []);
  const finishWelcome = useCallback(() => setWelcomePending(false), []);
  const sessionReady = status !== "initializing" && status !== "loading_identity";
  const shouldShowWelcome = welcomePending
    && status === "ready"
    && Boolean(identity?.profile.onboarding_completed_at)
    && !isPasswordRecovery;

  useEffect(() => {
    if (status !== "ready") return;
    if (identity?.profile.onboarding_completed_at) {
      void loadAuthenticatedApp();
      return;
    }
    void loadOnboardingFlow();
  }, [identity?.profile.onboarding_completed_at, status]);

  if (!splashFinished) {
    return <SplashScreen ready={sessionReady} onFinished={finishLaunch} />;
  }

  // A successful email sign-in temporarily sets `loading_identity`. Keeping
  // login mounted here prevents the old second-splash flash between auth and
  // the authenticated welcome acknowledgement.
  if (!sessionReady) return <AuthFlow onSignedIn={startWelcome} />;
  if (isPasswordRecovery) return <ResetPasswordScreen />;
  if (status === "signed_out") return <AuthFlow onSignedIn={startWelcome} />;

  if (status === "error") {
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
  if (!identity?.profile.onboarding_completed_at) return <LazyScreen><OnboardingFlow onFinished={startWelcome} /></LazyScreen>;
  return <LazyScreen><AuthenticatedApp /></LazyScreen>;
}

function LazyScreen({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={(
        <div className="app-loading-screen" role="status" aria-label="Carregando ORHA">
          <img
            src={`${import.meta.env.BASE_URL}brand/orha-mark-transparent.png`}
            width="697"
            height="177"
            alt=""
            draggable={false}
          />
        </div>
      )}
    >
      {children}
    </Suspense>
  );
}
