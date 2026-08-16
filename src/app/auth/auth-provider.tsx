import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
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
  const hydratedUserId = useRef<string | null>(null);
  const hydrationRequest = useRef(0);

  const hydrateIdentity = useCallback(async (nextSession: Session) => {
    const request = ++hydrationRequest.current;
    currentUserId.current = nextSession.user.id;
    setStatus("loading_identity");
    setError(null);

    try {
      const nextIdentity = await loadUserIdentity(nextSession.user.id);
      if (request !== hydrationRequest.current || currentUserId.current !== nextSession.user.id) return;
      hydratedUserId.current = nextSession.user.id;
      setIdentity(nextIdentity);
      setStatus("ready");
    } catch {
      if (request !== hydrationRequest.current || currentUserId.current !== nextSession.user.id) return;
      setError("Não foi possível carregar sua conta. Verifique a conexão e tente novamente.");
      setStatus("error");
    }
  }, []);

  const applySession = useCallback(
    (event: AuthChangeEvent, nextSession: Session | null) => {
      setSession(nextSession);

      if (!nextSession) {
        hydrationRequest.current += 1;
        currentUserId.current = null;
        hydratedUserId.current = null;
        setIdentity(null);
        setIsPasswordRecovery(false);
        setStatus("signed_out");
        return;
      }

      currentUserId.current = nextSession.user.id;

      // Refresh events only replace the token. Re-querying four identity tables
      // here would duplicate work every time the tab regains focus.
      if (event === "TOKEN_REFRESHED" && hydratedUserId.current === nextSession.user.id) return;
      if (event === "SIGNED_IN" && hydratedUserId.current === nextSession.user.id) {
        setStatus("ready");
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
      applySession(event, nextSession);
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
