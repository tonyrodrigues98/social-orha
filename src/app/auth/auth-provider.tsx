import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Session } from "@supabase/supabase-js";
import type { UserIdentity } from "@/domain/identity";
import { getSupabaseClient } from "@/infrastructure/supabase/client";
import { loadUserIdentity } from "@/infrastructure/supabase/identity-repository";
import { AuthContext, type AuthContextValue, type AuthStatus } from "./auth-context";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("initializing");
  const [session, setSession] = useState<Session | null>(null);
  const [identity, setIdentity] = useState<UserIdentity | null>(null);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentUserId = useRef<string | null>(null);

  const hydrateIdentity = useCallback(async (nextSession: Session) => {
    currentUserId.current = nextSession.user.id;
    setStatus("loading_identity");
    setError(null);

    try {
      const nextIdentity = await loadUserIdentity(nextSession.user.id);
      if (currentUserId.current !== nextSession.user.id) return;
      setIdentity(nextIdentity);
      setStatus("ready");
    } catch {
      if (currentUserId.current !== nextSession.user.id) return;
      setError("Não foi possível carregar sua conta. Verifique a conexão e tente novamente.");
      setStatus("error");
    }
  }, []);

  const applySession = useCallback(
    (nextSession: Session | null) => {
      setSession(nextSession);

      if (!nextSession) {
        currentUserId.current = null;
        setIdentity(null);
        setStatus("signed_out");
        return;
      }

      void hydrateIdentity(nextSession);
    },
    [hydrateIdentity],
  );

  useEffect(() => {
    const client = getSupabaseClient();
    const { data: authListener } = client.auth.onAuthStateChange((event, nextSession) => {
      if (event === "PASSWORD_RECOVERY") setIsPasswordRecovery(true);
      applySession(nextSession);
    });

    void client.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) {
        setError("Não foi possível restaurar sua sessão.");
        setStatus("error");
        return;
      }
      applySession(data.session);
    });

    return () => authListener.subscription.unsubscribe();
  }, [applySession]);

  const refreshIdentity = useCallback(async () => {
    if (!session) return;
    await hydrateIdentity(session);
  }, [hydrateIdentity, session]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      user: session?.user ?? null,
      identity,
      isPasswordRecovery,
      error,
      refreshIdentity,
      finishPasswordRecovery: () => setIsPasswordRecovery(false),
    }),
    [error, identity, isPasswordRecovery, refreshIdentity, session, status],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
