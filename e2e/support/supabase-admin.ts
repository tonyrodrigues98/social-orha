import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { expectedSupabaseHost } from "./environment";

type GeneratedAuthLink = {
  actionLink: string;
  userId: string;
};

function serviceRoleKey(): string {
  const value = process.env.ORHA_E2E_SERVICE_ROLE_KEY?.trim();
  if (!value) {
    throw new Error(
      "ORHA_E2E_SERVICE_ROLE_KEY é obrigatória no processo Node da jornada Auth.",
    );
  }
  return value;
}

export function createE2EAdminClient(): SupabaseClient {
  const stagingUrl = process.env.ORHA_STAGING_SUPABASE_URL?.trim();
  if (!stagingUrl) {
    throw new Error(
      "ORHA_STAGING_SUPABASE_URL é obrigatória para o cliente Admin E2E.",
    );
  }
  if (new URL(stagingUrl).host !== expectedSupabaseHost()) {
    throw new Error(
      "A URL e o host configurados para o Supabase de staging não coincidem.",
    );
  }
  return createClient(stagingUrl, serviceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

export async function generateSignupLink(
  client: SupabaseClient,
  email: string,
  password: string,
  redirectTo: string,
): Promise<GeneratedAuthLink> {
  const { data, error } = await client.auth.admin.generateLink({
    type: "signup",
    email,
    password,
    options: { redirectTo },
  });
  if (error || !data.user?.id || !data.properties?.action_link) {
    throw new Error("O Supabase não gerou o link real de confirmação.");
  }
  return {
    actionLink: data.properties.action_link,
    userId: data.user.id,
  };
}

export async function generateRecoveryLink(
  client: SupabaseClient,
  email: string,
  redirectTo: string,
): Promise<string> {
  const { data, error } = await client.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo },
  });
  if (error || !data.properties?.action_link) {
    throw new Error("O Supabase não gerou o link real de recuperação.");
  }
  return data.properties.action_link;
}

export async function findUserByEmail(
  client: SupabaseClient,
  email: string,
): Promise<User | null> {
  const normalized = email.toLowerCase();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw new Error("Não foi possível localizar o usuário E2E temporário.");
    const match = data.users.find(
      (user) => user.email?.toLowerCase() === normalized,
    );
    if (match) return match;
    if (data.users.length < 1000) return null;
  }
  throw new Error("A busca segura pelo usuário E2E excedeu o limite de páginas.");
}

export async function deleteTemporaryUser(
  client: SupabaseClient,
  userId: string,
): Promise<void> {
  const { error } = await client.auth.admin.deleteUser(userId, false);
  if (error) {
    throw new Error("O Supabase não removeu o usuário E2E temporário.");
  }
}
