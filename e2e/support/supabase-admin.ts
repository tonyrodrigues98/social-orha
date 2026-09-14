import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import {
  expectedAppRoleForPrincipal,
  expectedSupabaseHost,
  type TestPrincipal,
} from "./environment";

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

/**
 * Fails the setup before browser journeys when a named staging identity is
 * incomplete or has a role different from the authoritative user_roles row.
 */
export async function assertE2EPrincipalProvisioning(
  client: SupabaseClient,
  principal: TestPrincipal,
  userId: string,
): Promise<void> {
  const [profileResult, roleResult] = await Promise.all([
    client
      .from("profiles")
      .select("onboarding_completed_at")
      .eq("id", userId)
      .single(),
    client
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .single(),
  ]);

  if (profileResult.error || !profileResult.data?.onboarding_completed_at) {
    throw new Error(
      `A conta E2E ${principal} precisa ter o onboarding concluído no staging.`,
    );
  }

  const expectedRole = expectedAppRoleForPrincipal(principal);
  if (roleResult.error || roleResult.data?.role !== expectedRole) {
    throw new Error(
      `A conta E2E ${principal} precisa ter exatamente o papel ${expectedRole} no backend.`,
    );
  }
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

/** Removes only a uniquely named E2E support fixture and its user-facing notifications. */
export async function deleteSupportTicketFixture(
  client: SupabaseClient,
  subject: string,
): Promise<void> {
  const { data, error } = await client
    .from("support_tickets")
    .select("id")
    .eq("subject", subject);
  if (error) throw new Error("Não foi possível localizar o chamado E2E para limpeza.");

  for (const ticket of data ?? []) {
    const { error: notificationError } = await client
      .from("notifications")
      .delete()
      .eq("entity_type", "support_ticket")
      .eq("entity_id", ticket.id);
    if (notificationError) throw new Error("Não foi possível limpar notificações do chamado E2E.");

    const { error: ticketError } = await client
      .from("support_tickets")
      .delete()
      .eq("id", ticket.id);
    if (ticketError) throw new Error("Não foi possível remover o chamado E2E.");
  }
}
