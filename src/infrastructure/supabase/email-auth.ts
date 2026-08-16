import type {
  AuthResponse,
  AuthTokenResponsePassword,
} from "@supabase/supabase-js";
import { getSupabaseClient } from "./client";

export type EmailSignUpInput = {
  email: string;
  password: string;
};

export function getAuthRedirectUrl(
  origin = window.location.origin,
  baseUrl = import.meta.env.BASE_URL,
): string {
  return new URL(baseUrl, `${origin.replace(/\/$/, "")}/`).href;
}

export async function signUpWithEmail({
  email,
  password,
}: EmailSignUpInput): Promise<AuthResponse> {
  return getSupabaseClient().auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: getAuthRedirectUrl(),
    },
  });
}

export async function signInWithEmail(
  email: string,
  password: string,
): Promise<AuthTokenResponsePassword> {
  return getSupabaseClient().auth.signInWithPassword({ email, password });
}

export async function signOut(): Promise<void> {
  const { error } = await getSupabaseClient().auth.signOut();
  if (error) throw error;
}

export async function sendPasswordRecovery(email: string): Promise<void> {
  const { error } = await getSupabaseClient().auth.resetPasswordForEmail(email, {
    redirectTo: getAuthRedirectUrl(),
  });
  if (error) throw error;
}

export async function updatePassword(password: string): Promise<void> {
  const { error } = await getSupabaseClient().auth.updateUser({ password });
  if (error) throw error;
}

export async function resendSignUpConfirmation(email: string) {
  return getSupabaseClient().auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: getAuthRedirectUrl() },
  });
}
