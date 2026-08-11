import { createContext, useContext } from "react";
import type { Session, User } from "@supabase/supabase-js";
import type { UserIdentity } from "@/domain/identity";

export type AuthStatus = "initializing" | "signed_out" | "loading_identity" | "ready" | "error";

export type AuthContextValue = {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  identity: UserIdentity | null;
  isPasswordRecovery: boolean;
  error: string | null;
  refreshIdentity: () => Promise<void>;
  finishPasswordRecovery: () => void;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth precisa estar dentro de AuthProvider.");
  return context;
}
