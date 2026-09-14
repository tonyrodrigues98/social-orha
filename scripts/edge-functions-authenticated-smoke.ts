import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const STAGING_PROJECT_REF = "bgeauxljwjbtbwpbzpoo";
const STAGING_ORIGIN = `https://${STAGING_PROJECT_REF}.supabase.co`;

type ExportArtifact = {
  requestId: string;
  downloadUrl: string;
  byteSize: number;
  sha256: string;
};

export type AuthenticatedEdgeSmokeResult = {
  checks: readonly string[];
  cleanupVerified: boolean;
};

type SmokeEnvironment = {
  supabaseUrl: string;
  publishableKey: string;
  serviceRoleKey: string;
};

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment: ${name}.`);
  return value;
}

export function validateStagingSupabaseUrl(value: string): string {
  const url = new URL(value);
  if (
    url.origin !== STAGING_ORIGIN ||
    (url.pathname !== "/" && url.pathname !== "") ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "Authenticated Edge smoke is restricted to the ORHA staging project.",
    );
  }
  return url.origin;
}

export function parseExportArtifact(
  value: unknown,
  expectedRequestId: string,
): ExportArtifact {
  if (!value || typeof value !== "object")
    throw new Error("Invalid account-export response.");
  const artifact = (value as { artifact?: unknown }).artifact;
  if (!artifact || typeof artifact !== "object")
    throw new Error("Missing account-export artifact.");
  const row = artifact as Record<string, unknown>;
  if (
    row.requestId !== expectedRequestId ||
    typeof row.downloadUrl !== "string" ||
    typeof row.byteSize !== "number" ||
    !Number.isSafeInteger(row.byteSize) ||
    row.byteSize < 2 ||
    typeof row.sha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(row.sha256)
  ) {
    throw new Error("Invalid account-export artifact contract.");
  }
  const downloadUrl = new URL(row.downloadUrl);
  if (
    downloadUrl.protocol !== "https:" ||
    !downloadUrl.hostname.endsWith(".supabase.co")
  ) {
    throw new Error("Account export returned an untrusted download URL.");
  }
  return {
    requestId: row.requestId,
    downloadUrl: downloadUrl.toString(),
    byteSize: row.byteSize,
    sha256: row.sha256,
  };
}

function client(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

async function invoke(
  environment: SmokeEnvironment,
  functionName: string,
  accessToken: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetch(`${environment.supabaseUrl}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      apikey: environment.publishableKey,
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
}

async function cleanupEphemeralAccount(
  admin: SupabaseClient,
  userId: string,
): Promise<void> {
  const artifacts = await admin
    .from("account_export_artifacts")
    .select("bucket_id,object_path")
    .eq("user_id", userId);
  if (artifacts.error)
    throw new Error(
      "Could not enumerate temporary export artifacts for cleanup.",
    );

  for (const row of artifacts.data ?? []) {
    const removal = await admin.storage
      .from(row.bucket_id)
      .remove([row.object_path]);
    if (removal.error)
      throw new Error("Could not remove a temporary export artifact.");
  }

  const deletion = await admin.auth.admin.deleteUser(userId, false);
  if (deletion.error)
    throw new Error("Could not delete the temporary authenticated smoke user.");

  const verification = await admin.auth.admin.getUserById(userId);
  if (verification.data.user)
    throw new Error(
      "Temporary authenticated smoke user still exists after cleanup.",
    );
}

export async function runAuthenticatedEdgeFunctionSmoke(
  environment: SmokeEnvironment,
): Promise<AuthenticatedEdgeSmokeResult> {
  const supabaseUrl = validateStagingSupabaseUrl(environment.supabaseUrl);
  const normalized = { ...environment, supabaseUrl };
  const admin = client(supabaseUrl, environment.serviceRoleKey);
  const userClient = client(supabaseUrl, environment.publishableKey);
  const unique = randomUUID();
  const email = `orha-edge-smoke-${unique}@example.invalid`;
  const password = `Orha-Smoke-${unique}!`;
  const checks: string[] = [];
  let userId: string | null = null;
  let cleanupVerified = false;

  try {
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { test_scope: "authenticated-edge-smoke" },
    });
    if (created.error || !created.data.user)
      throw new Error("Could not create the temporary smoke user.");
    userId = created.data.user.id;
    checks.push("temporary-user-created");

    const signedIn = await userClient.auth.signInWithPassword({
      email,
      password,
    });
    const accessToken = signedIn.data.session?.access_token;
    if (signedIn.error || !accessToken)
      throw new Error("Temporary smoke user could not authenticate.");
    checks.push("password-session-issued");

    const catalogResponse = await invoke(
      normalized,
      "catalog-search",
      accessToken,
      {
        category: "books",
        query: "Narnia",
        limit: 3,
      },
    );
    const catalogBody = (await catalogResponse.json().catch(() => null)) as {
      items?: unknown;
    } | null;
    if (
      !catalogResponse.ok ||
      !Array.isArray(catalogBody?.items) ||
      catalogBody.items.length < 1
    ) {
      throw new Error(
        `catalog-search contract failed with status ${catalogResponse.status}.`,
      );
    }
    checks.push("catalog-search-real-provider");

    const lifecycle = await userClient.rpc("request_account_lifecycle", {
      p_kind: "data_export",
      p_confirmation: null,
    });
    const lifecycleRow = Array.isArray(lifecycle.data)
      ? lifecycle.data[0]
      : lifecycle.data;
    const requestId =
      lifecycleRow && typeof lifecycleRow === "object"
        ? (lifecycleRow as { id?: unknown }).id
        : null;
    if (lifecycle.error || typeof requestId !== "string") {
      throw new Error("Could not create the temporary data-export request.");
    }
    checks.push("data-export-request-persisted");

    const exportResponse = await invoke(
      normalized,
      "account-export",
      accessToken,
      { requestId },
    );
    const exportBody: unknown = await exportResponse.json().catch(() => null);
    if (!exportResponse.ok)
      throw new Error(
        `account-export failed with status ${exportResponse.status}.`,
      );
    const artifact = parseExportArtifact(exportBody, requestId);
    checks.push("account-export-artifact-created");

    const download = await fetch(artifact.downloadUrl, {
      signal: AbortSignal.timeout(20_000),
    });
    if (!download.ok)
      throw new Error(
        `Account export download failed with status ${download.status}.`,
      );
    const bytes = Buffer.from(await download.arrayBuffer());
    const digest = createHash("sha256").update(bytes).digest("hex");
    const exported = JSON.parse(bytes.toString("utf8")) as Record<
      string,
      unknown
    >;
    const exportedAccount =
      exported.account && typeof exported.account === "object"
        ? (exported.account as Record<string, unknown>)
        : null;
    if (
      bytes.byteLength !== artifact.byteSize ||
      digest !== artifact.sha256 ||
      exported.schemaVersion !== 1 ||
      exported.requestId !== requestId ||
      exportedAccount?.id !== userId
    ) {
      throw new Error(
        "Downloaded account export failed integrity or ownership validation.",
      );
    }
    checks.push("account-export-download-integrity");

    const repeated = await invoke(normalized, "account-export", accessToken, {
      requestId,
    });
    const repeatedBody: unknown = await repeated.json().catch(() => null);
    if (!repeated.ok)
      throw new Error(
        `Idempotent account-export retry failed with status ${repeated.status}.`,
      );
    parseExportArtifact(repeatedBody, requestId);
    checks.push("account-export-idempotent-retry");
  } finally {
    await userClient.auth.signOut().catch(() => undefined);
    if (userId) {
      await cleanupEphemeralAccount(admin, userId);
      cleanupVerified = true;
    }
  }

  return { checks, cleanupVerified };
}

async function main(): Promise<void> {
  const result = await runAuthenticatedEdgeFunctionSmoke({
    supabaseUrl: requiredEnvironment("ORHA_STAGING_SUPABASE_URL"),
    publishableKey: requiredEnvironment(
      "ORHA_STAGING_SUPABASE_PUBLISHABLE_KEY",
    ),
    serviceRoleKey: requiredEnvironment("ORHA_E2E_SERVICE_ROLE_KEY"),
  });
  const checks = result.checks.length + Number(result.cleanupVerified);
  console.log(
    `ORHA Edge Functions authenticated staging smoke: ${checks}/${checks} passed.`,
  );
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  void main().catch((error: unknown) => {
    console.error(
      error instanceof Error
        ? error.message
        : "Authenticated Edge smoke failed.",
    );
    process.exitCode = 1;
  });
}
