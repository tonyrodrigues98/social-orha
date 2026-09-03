import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.112.2";

type RuntimeEnvironment = {
  env: {
    get(name: string): string | undefined;
  };
};

function runtimeEnvironment(): RuntimeEnvironment {
  const runtime = (globalThis as { Deno?: RuntimeEnvironment }).Deno;
  if (!runtime) throw new Error("edge_runtime_unavailable");
  return runtime;
}

export function optionalEnvironment(name: string): string | undefined {
  const value = runtimeEnvironment().env.get(name)?.trim();
  return value || undefined;
}

export function requiredEnvironment(name: string): string {
  const value = optionalEnvironment(name);
  if (!value) throw new Error(`missing_environment_${name.toLocaleLowerCase("en-US")}`);
  return value;
}

const clientOptions = {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false,
  },
  global: {
    headers: { "X-Client-Info": "orha-edge-workers/1.0" },
  },
} as const;

export function createServiceClient(): SupabaseClient {
  return createClient(
    requiredEnvironment("SUPABASE_URL"),
    requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
    clientOptions,
  );
}

export function bearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
  return match?.[1] ?? null;
}

export async function requireAuthenticatedUser(request: Request): Promise<{
  accessToken: string;
  client: SupabaseClient;
  user: {
    id: string;
    email?: string;
    created_at: string;
    updated_at?: string;
    last_sign_in_at?: string;
    email_confirmed_at?: string;
    phone_confirmed_at?: string;
    user_metadata: Record<string, unknown>;
    app_metadata: Record<string, unknown>;
  };
}> {
  const accessToken = bearerToken(request);
  if (!accessToken) throw new EdgeHttpError(401, "authentication_required", "Autenticação necessária.");

  const client = createClient(
    requiredEnvironment("SUPABASE_URL"),
    requiredEnvironment("SUPABASE_ANON_KEY"),
    {
      ...clientOptions,
      global: {
        headers: {
          ...clientOptions.global.headers,
          Authorization: `Bearer ${accessToken}`,
        },
      },
    },
  );
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user) {
    throw new EdgeHttpError(401, "invalid_session", "Sua sessão expirou. Entre novamente.");
  }

  return {
    accessToken,
    client,
    user: {
      id: data.user.id,
      email: data.user.email,
      created_at: data.user.created_at,
      updated_at: data.user.updated_at,
      last_sign_in_at: data.user.last_sign_in_at,
      email_confirmed_at: data.user.email_confirmed_at,
      phone_confirmed_at: data.user.phone_confirmed_at,
      user_metadata: data.user.user_metadata,
      app_metadata: data.user.app_metadata,
    },
  };
}

export class EdgeHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "EdgeHttpError";
  }
}

