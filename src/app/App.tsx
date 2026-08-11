import { lazy, Suspense, useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { signOut } from "@/infrastructure/supabase/email-auth";
import { useAuth } from "./auth/auth-context";
import { AuthProvider } from "./auth/auth-provider";
import { SplashScreen } from "./components/splash-screen";

const AuthFlow = lazy(() => import("./auth/auth-flow").then((module) => ({ default: module.AuthFlow })));
const ResetPasswordScreen = lazy(() => import("./auth/auth-flow").then((module) => ({ default: module.ResetPasswordScreen })));
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
  const [minimumLaunchFinished, setMinimumLaunchFinished] = useState(false);

  if (!minimumLaunchFinished || status === "initializing" || status === "loading_identity") {
    return <SplashScreen onFinished={() => setMinimumLaunchFinished(true)} />;
  }

  if (isPasswordRecovery) return <LazyScreen><ResetPasswordScreen /></LazyScreen>;
  if (status === "signed_out") return <LazyScreen><AuthFlow /></LazyScreen>;

  if (status === "error") {
    return (
      <div className="session-error-screen">
        <span>NÃ£o conseguimos abrir sua conta</span>
        <h1>Sua sessÃ£o estÃ¡ segura.</h1>
        <p>{error}</p>
        <Button className="auth-primary-button" size="xl" onPress={() => void refreshIdentity()}>Tentar novamente</Button>
        <button type="button" className="auth-text-action" onClick={() => void signOut()}>Sair desta conta</button>
      </div>
    );
  }

  if (!identity?.profile.onboarding_completed_at) return <LazyScreen><OnboardingFlow /></LazyScreen>;
  return <LazyScreen><AuthenticatedApp /></LazyScreen>;
}

function LazyScreen({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<SplashScreen />}>{children}</Suspense>;
}

