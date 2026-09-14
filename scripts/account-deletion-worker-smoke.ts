import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const STAGING_PROJECT_REF = "bgeauxljwjbtbwpbzpoo";
const STAGING_ORIGIN = `https://${STAGING_PROJECT_REF}.supabase.co`;
const executeFile = promisify(execFile);

type SmokeEnvironment = {
  supabaseUrl: string;
  publishableKey: string;
  serviceRoleKey: string;
  workspace: string;
};

export type AccountDeletionSmokeResult = {
  checks: readonly string[];
  cleanupVerified: boolean;
};

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment: ${name}.`);
  return value;
}

export function validateDeletionSmokeTarget(
  supabaseUrl: string,
  linkedProjectRef: string,
): string {
  const url = new URL(supabaseUrl);
  if (
    url.origin !== STAGING_ORIGIN ||
    (url.pathname !== "/" && url.pathname !== "") ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    linkedProjectRef.trim() !== STAGING_PROJECT_REF
  ) {
    throw new Error(
      "Account-deletion smoke is restricted to the linked ORHA staging project.",
    );
  }
  return url.origin;
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

function sanitizedCliEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  delete environment.ORHA_E2E_SERVICE_ROLE_KEY;
  delete environment.ORHA_STAGING_SUPABASE_PUBLISHABLE_KEY;
  return environment;
}

async function triggerLinkedLifecycleWorker(workspace: string): Promise<void> {
  const cliEntrypoint = path.join(
    workspace,
    "node_modules",
    "supabase",
    "dist",
    "supabase.js",
  );
  try {
    await executeFile(
      process.execPath,
      [
        cliEntrypoint,
        "db",
        "query",
        "--linked",
        "--output-format",
        "json",
        "select private.invoke_orha_worker('account-lifecycle-worker', 10) as request_id;",
      ],
      {
        cwd: workspace,
        env: sanitizedCliEnvironment(),
        timeout: 60_000,
        windowsHide: true,
        maxBuffer: 1_048_576,
      },
    );
  } catch {
    throw new Error(
      "Could not trigger the linked account-lifecycle worker through Vault.",
    );
  }
}

async function authUserExists(
  admin: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const result = await admin.auth.admin.getUserById(userId);
  return Boolean(result.data.user);
}

async function waitForWorkerDeletion(
  admin: SupabaseClient,
  userId: string,
  attempts: number,
): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (!(await authUserExists(admin, userId))) return true;
    await delay(1_000);
  }
  return !(await authUserExists(admin, userId));
}

async function cleanupFixture(
  admin: SupabaseClient,
  input: {
    userId: string | null;
    requestId: string | null;
    objectPath: string | null;
  },
): Promise<boolean> {
  if (input.objectPath) {
    const removal = await admin.storage
      .from("profile-media")
      .remove([input.objectPath]);
    if (removal.error)
      throw new Error("Could not clean the deletion-smoke Storage object.");
  }
  if (input.userId && (await authUserExists(admin, input.userId))) {
    const deletion = await admin.auth.admin.deleteUser(input.userId, false);
    if (deletion.error)
      throw new Error("Could not clean the deletion-smoke Auth user.");
  }
  if (input.requestId) {
    const tombstone = await admin
      .from("account_deletion_tombstones")
      .delete()
      .eq("request_id", input.requestId);
    if (tombstone.error)
      throw new Error("Could not clean a deletion-smoke tombstone.");
  }

  const [authExists, profile, tombstone] = await Promise.all([
    input.userId ? authUserExists(admin, input.userId) : Promise.resolve(false),
    input.userId
      ? admin.from("profiles").select("id").eq("id", input.userId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    input.requestId
      ? admin
          .from("account_deletion_tombstones")
          .select("request_id")
          .eq("request_id", input.requestId)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (profile.error || tombstone.error)
    throw new Error("Could not verify deletion-smoke cleanup.");
  // Audit rows are deliberately append-only, including for postgres. They are trusted
  // operational evidence, not mutable fixture state, and must survive account deletion.
  return !authExists && !profile.data && tombstone.data.length === 0;
}

export async function runAccountDeletionWorkerSmoke(
  environment: SmokeEnvironment,
): Promise<AccountDeletionSmokeResult> {
  const linkedRef = await readFile(
    path.join(environment.workspace, "supabase", ".temp", "project-ref"),
    "utf8",
  );
  const supabaseUrl = validateDeletionSmokeTarget(
    environment.supabaseUrl,
    linkedRef,
  );
  const admin = client(supabaseUrl, environment.serviceRoleKey);
  const userClient = client(supabaseUrl, environment.publishableKey);
  const unique = randomUUID();
  const email = `orha-delete-smoke-${unique}@example.invalid`;
  const password = `Orha-Delete-${unique}!`;
  const checks: string[] = [];
  let userId: string | null = null;
  let requestId: string | null = null;
  let objectPath: string | null = null;
  let cleanupVerified: boolean | undefined;

  try {
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { test_scope: "account-deletion-worker-smoke" },
    });
    if (created.error || !created.data.user)
      throw new Error("Could not create the temporary deletion-smoke user.");
    userId = created.data.user.id;
    checks.push("temporary-deletion-user-created");

    const signedIn = await userClient.auth.signInWithPassword({
      email,
      password,
    });
    if (signedIn.error || !signedIn.data.session)
      throw new Error("Temporary deletion-smoke user could not authenticate.");
    checks.push("fresh-password-session-issued");

    objectPath = `${userId}/deletion-smoke/${randomUUID()}.png`;
    const storage = await admin.storage
      .from("profile-media")
      .upload(objectPath, Buffer.from("89504e470d0a1a0a", "hex"), {
        contentType: "image/png",
        upsert: false,
      });
    if (storage.error)
      throw new Error("Could not create the temporary deletion-smoke object.");
    checks.push("owned-storage-object-created");

    const denied = await userClient.rpc("request_account_lifecycle", {
      p_kind: "delete",
      p_confirmation: "INVALID",
    });
    if (!denied.error)
      throw new Error("Account deletion accepted an invalid confirmation.");
    checks.push("invalid-explicit-confirmation-rejected");

    const requested = await userClient.rpc("request_account_lifecycle", {
      p_kind: "delete",
      p_confirmation: "CONFIRMAR",
    });
    const lifecycle = Array.isArray(requested.data)
      ? requested.data[0]
      : requested.data;
    if (
      requested.error ||
      !lifecycle ||
      typeof lifecycle !== "object" ||
      typeof (lifecycle as { id?: unknown }).id !== "string" ||
      typeof (lifecycle as { requested_at?: unknown }).requested_at !== "string"
    ) {
      throw new Error(
        "Could not persist the temporary account-deletion request.",
      );
    }
    requestId = (lifecycle as { id: string }).id;
    const requestedAt = (lifecycle as { requested_at: string }).requested_at;
    checks.push("delayed-account-deletion-requested");

    const due = await admin
      .from("account_lifecycle_requests")
      .update({ execute_after: requestedAt })
      .eq("id", requestId)
      .eq("user_id", userId)
      .eq("kind", "delete")
      .select("id")
      .single();
    if (due.error || due.data.id !== requestId)
      throw new Error(
        "Could not make the exact temporary deletion request due.",
      );
    checks.push("temporary-deletion-made-due");

    await triggerLinkedLifecycleWorker(environment.workspace);
    let deleted = await waitForWorkerDeletion(admin, userId, 20);
    if (!deleted) {
      await triggerLinkedLifecycleWorker(environment.workspace);
      deleted = await waitForWorkerDeletion(admin, userId, 20);
    }
    if (!deleted)
      throw new Error(
        "Account-lifecycle worker did not delete the temporary user.",
      );
    checks.push("worker-deleted-auth-user");

    const [profile, lifecycleAfter, tombstone, audit, object] =
      await Promise.all([
        admin.from("profiles").select("id").eq("id", userId).maybeSingle(),
        admin
          .from("account_lifecycle_requests")
          .select("id")
          .eq("id", requestId),
        admin
          .from("account_deletion_tombstones")
          .select("request_id")
          .eq("request_id", requestId),
        admin
          .from("audit_logs")
          .select("event_type")
          .eq("target_id", requestId)
          .eq("event_type", "account.deletion_completed"),
        admin.storage.from("profile-media").download(objectPath),
      ]);
    if (
      profile.error ||
      profile.data ||
      lifecycleAfter.error ||
      lifecycleAfter.data.length > 0 ||
      tombstone.error ||
      tombstone.data.length > 0 ||
      audit.error ||
      audit.data.length !== 1 ||
      !object.error
    ) {
      throw new Error(
        "Account deletion did not reconcile Auth, profile, Storage and audit state.",
      );
    }
    checks.push("deletion-storage-profile-tombstone-reconciled");
    checks.push("deletion-completion-audited");
  } finally {
    await userClient.auth.signOut().catch(() => undefined);
    cleanupVerified = await cleanupFixture(admin, {
      userId,
      requestId,
      objectPath,
    });
  }

  return { checks, cleanupVerified: cleanupVerified ?? false };
}

async function main(): Promise<void> {
  const result = await runAccountDeletionWorkerSmoke({
    supabaseUrl: requiredEnvironment("ORHA_STAGING_SUPABASE_URL"),
    publishableKey: requiredEnvironment(
      "ORHA_STAGING_SUPABASE_PUBLISHABLE_KEY",
    ),
    serviceRoleKey: requiredEnvironment("ORHA_E2E_SERVICE_ROLE_KEY"),
    workspace: process.cwd(),
  });
  const checks = result.checks.length + Number(result.cleanupVerified);
  console.log(
    `ORHA account-deletion worker staging smoke: ${checks}/${checks} passed.`,
  );
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  void main().catch((error: unknown) => {
    console.error(
      error instanceof Error
        ? error.message
        : "Account-deletion worker smoke failed.",
    );
    process.exitCode = 1;
  });
}
