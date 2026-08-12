import { lazy, Suspense, useCallback, useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { signOut } from "@/infrastructure/supabase/email-auth";
import { useAuth } from "./auth/auth-context";
import { AuthProvider } from "./auth/auth-provider";
import { AuthFlow, ResetPasswordScreen } from "./auth/auth-flow";
import { SplashScreen } from "./components/splash-screen";
import { WelcomeScreen } from "./components/welcome-screen";

const OnboardingFlow = lazy(() => import("./onboarding/onboarding-flow").then((module) => ({ default: module.OnboardingFlow })));
const AuthenticatedApp = lazy(() => import("./authenticated-app").then((module) => ({ default: module.AuthenticatedApp })));

export function App() {
  return (
    <AuthProvider>
      <div className="device-stage">
        <div className="native-app-shell">
          <AppGate />
        </div>
      </div>
    </AuthProvider>
  );
}

function AppGate() {
  const { status, identity, isPasswordRecovery, error, refreshIdentity } = useAuth();
  const [splashFinished, setSplashFinished] = useState(false);
  const [splashLeaving, setSplashLeaving] = useState(false);
  const [welcomePending, setWelcomePending] = useState(false);
  const finishLaunch = useCallback(() => setSplashFinished(true), []);
  const startWelcome = useCallback(() => setWelcomePending(true), []);
  const finishWelcome = useCallback(() => setWelcomePending(false), []);
  const sessionReady = status !== "initializing" && status !== "loading_identity";
  const shouldShowWelcome = welcomePending
    && status === "ready"
    && Boolean(identity?.profile.onboarding_completed_at)
    && !isPasswordRecovery;

  if (!splashFinished) {
    if (status === "signed_out") {
      return (
        <div className={`launch-stack ${splashLeaving ? "is-transitioning" : ""}`}>
          <AuthFlow launchVisible={splashLeaving} onSignedIn={startWelcome} />
          <SplashScreen ready={sessionReady} onExiting={() => setSplashLeaving(true)} onFinished={finishLaunch} />
        </div>
      );
    }

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
  return <Suspense fallback={<div className="splash-screen" aria-hidden="true" />}>{children}</Suspense>;
}

