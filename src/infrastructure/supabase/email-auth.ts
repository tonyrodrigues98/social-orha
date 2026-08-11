import type {
  AuthResponse,
  AuthTokenResponsePassword,
} from "@supabase/supabase-js";
import { getSupabaseClient } from "./client";

export type EmailSignUpInput = {
  email: string;
  password: string;
};

export async function signUpWithEmail({
  email,
  password,
}: EmailSignUpInput): Promise<AuthResponse> {
  return getSupabaseClient().auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: window.location.origin,
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
    redirectTo: window.location.origin,
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
    options: { emailRedirectTo: window.location.origin },
  });
}
