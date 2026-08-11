import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const projectUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

export const supabaseConnection = {
  projectUrl: projectUrl ?? null,
  configured: Boolean(projectUrl && publishableKey),
} as const;

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!projectUrl || !publishableKey) {
    throw new Error(
      "Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  client ??= createClient(projectUrl, publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return client;
}
