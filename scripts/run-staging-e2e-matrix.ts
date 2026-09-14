import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { validateSocialSmokeTarget } from "./social-domain-smoke-target";
import {
  createEphemeralMatrixIdentity,
  type EphemeralMatrixIdentity,
  MATRIX_PRINCIPALS,
  matrixEnvironment,
} from "./staging-e2e-matrix-contract";

type ProvisionedIdentity = EphemeralMatrixIdentity & { id: string };
type StoredObject = { bucket_id: string; object_path: string };

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required staging environment: ${name}.`);
  return value;
}

function rpcRow(value: unknown): Record<string, unknown> {
  const row = Array.isArray(value) ? value[0] : value;
  return row && typeof row === "object" ? (row as Record<string, unknown>) : {};
}

async function provisionIdentity(
  admin: SupabaseClient,
  identity: EphemeralMatrixIdentity,
  stagingUrl: string,
  publishableKey: string,
): Promise<ProvisionedIdentity> {
  const created = await admin.auth.admin.createUser({
    email: identity.email,
    password: identity.password,
    email_confirm: true,
    user_metadata: {
      test_scope: "staging-five-role-browser-matrix",
      test_principal: identity.principal,
    },
  });
  if (created.error || !created.data.user) {
    throw new Error(`Não foi possível criar a identidade efêmera ${identity.principal}.`);
  }
  const id = created.data.user.id;
  const userClient = createClient(stagingUrl, publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  try {
    const signedIn = await userClient.auth.signInWithPassword({
      email: identity.email,
      password: identity.password,
    });
    if (signedIn.error || !signedIn.data.session) {
      throw new Error(`A identidade efêmera ${identity.principal} não autenticou.`);
    }

    const prepared = await admin
      .from("profiles")
      .update({
        full_name: identity.fullName,
        username: identity.username,
        birth_date: "1990-01-01",
        state_code: "SP",
        city: "São Paulo",
        bio: "Identidade efêmera isolada para a matriz E2E de staging.",
        onboarding_step: 5,
      })
      .eq("id", id)
      .select("id")
      .single();
    if (prepared.error || prepared.data?.id !== id) {
      throw new Error(`O perfil efêmero ${identity.principal} não foi preparado.`);
    }

    const completed = await userClient.rpc("complete_own_onboarding");
    if (completed.error || rpcRow(completed.data).id !== id) {
      throw new Error(`O onboarding efêmero ${identity.principal} não foi concluído.`);
    }

    const role = await admin
      .from("user_roles")
      .update({ role: identity.role })
      .eq("user_id", id)
      .select("role")
      .single();
    if (role.error || role.data?.role !== identity.role) {
      throw new Error(`O papel ${identity.role} não foi aplicado a ${identity.principal}.`);
    }
    return { ...identity, id };
  } catch (error) {
    await admin.auth.admin.deleteUser(id, false);
    throw error;
  } finally {
    await userClient.auth.signOut();
  }
}

async function collectOwnedObjects(
  admin: SupabaseClient,
  table: string,
  ownerColumn: string,
  ids: readonly string[],
): Promise<StoredObject[]> {
  const result = await admin
    .from(table)
    .select("bucket_id, object_path")
    .in(ownerColumn, ids);
  if (result.error) {
    throw new Error(`Não foi possível inspecionar objetos efêmeros em ${table}.`);
  }
  return (result.data ?? []).flatMap((row) => {
    const candidate = row as unknown as Partial<StoredObject>;
    return typeof candidate.bucket_id === "string" &&
      typeof candidate.object_path === "string"
      ? [{ bucket_id: candidate.bucket_id, object_path: candidate.object_path }]
      : [];
  });
}

async function removeStoredObjects(
  admin: SupabaseClient,
  objects: readonly StoredObject[],
): Promise<void> {
  const byBucket = new Map<string, Set<string>>();
  for (const object of objects) {
    const paths = byBucket.get(object.bucket_id) ?? new Set<string>();
    paths.add(object.object_path);
    byBucket.set(object.bucket_id, paths);
  }
  for (const [bucket, paths] of byBucket) {
    const removed = await admin.storage.from(bucket).remove([...paths]);
    if (removed.error) {
      throw new Error(`Não foi possível remover os objetos efêmeros do bucket ${bucket}.`);
    }
  }
}

async function cleanupMatrix(
  admin: SupabaseClient,
  identities: readonly ProvisionedIdentity[],
): Promise<void> {
  const ids = identities.map((identity) => identity.id);
  if (!ids.length) return;

  const objectGroups = await Promise.all([
    collectOwnedObjects(admin, "profile_media", "profile_id", ids),
    collectOwnedObjects(admin, "post_media", "owner_id", ids),
    collectOwnedObjects(admin, "message_attachments", "owner_id", ids),
    collectOwnedObjects(admin, "community_branding_media", "owner_id", ids),
    collectOwnedObjects(admin, "report_evidence", "uploader_id", ids),
  ]);
  await removeStoredObjects(admin, objectGroups.flat());

  const memberships = await admin
    .from("conversation_members")
    .select("conversation_id")
    .in("profile_id", ids);
  if (memberships.error) throw new Error("Não foi possível inspecionar conversas efêmeras.");
  const conversationIds = Array.from(
    new Set((memberships.data ?? []).map((row) => row.conversation_id)),
  );
  if (conversationIds.length) {
    const conversations = await admin
      .from("conversations")
      .delete()
      .in("id", conversationIds);
    if (conversations.error) throw new Error("Não foi possível remover conversas efêmeras.");
  }

  const tickets = await admin.from("support_tickets").delete().in("requester_id", ids);
  if (tickets.error) throw new Error("Não foi possível remover chamados efêmeros.");
  const communities = await admin.from("communities").delete().in("owner_id", ids);
  if (communities.error) throw new Error("Não foi possível remover comunidades efêmeras.");

  for (const identity of identities) {
    const deleted = await admin.auth.admin.deleteUser(identity.id, false);
    if (deleted.error) {
      throw new Error(`Não foi possível remover a identidade efêmera ${identity.principal}.`);
    }
  }

  const remainingProfiles = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .in("id", ids);
  if (remainingProfiles.error || remainingProfiles.count !== 0) {
    throw new Error("A limpeza deixou perfis efêmeros no staging.");
  }
}

function runPlaywright(environment: NodeJS.ProcessEnv): Promise<number> {
  const playwrightCli = path.resolve("node_modules", "playwright", "cli.js");
  const requestedTestFile = process.env.ORHA_E2E_MATRIX_TEST_FILE?.trim();
  const requestedProject =
    process.env.ORHA_E2E_MATRIX_PROJECT?.trim() || "authenticated-chromium";
  if (
    requestedTestFile &&
    !/^e2e\/[a-z0-9-]+\.spec\.ts$/i.test(requestedTestFile.replaceAll("\\", "/"))
  ) {
    throw new Error("ORHA_E2E_MATRIX_TEST_FILE precisa apontar para um arquivo e2e/*.spec.ts.");
  }
  if (
    !["authenticated-chromium", "authenticated-webkit-390x844"].includes(
      requestedProject,
    )
  ) {
    throw new Error("ORHA_E2E_MATRIX_PROJECT não pertence à allowlist E2E.");
  }
  const args = [
    playwrightCli,
    "test",
    ...(requestedTestFile ? [requestedTestFile.replaceAll("\\", "/")] : []),
    `--project=${requestedProject}`,
    "--workers=1",
    "--trace=retain-on-failure",
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      args,
      {
        cwd: process.cwd(),
        env: environment,
        stdio: "inherit",
        shell: false,
      },
    );
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`Playwright terminou pelo sinal ${signal}.`));
      else resolve(code ?? 1);
    });
  });
}

async function main(): Promise<void> {
  const stagingUrl = requiredEnvironment("ORHA_STAGING_SUPABASE_URL");
  const publishableKey = requiredEnvironment("ORHA_STAGING_SUPABASE_PUBLISHABLE_KEY");
  const serviceRoleKey = requiredEnvironment("ORHA_E2E_SERVICE_ROLE_KEY");
  const linkedRef = await readFile(path.resolve("supabase", ".temp", "project-ref"), "utf8");
  validateSocialSmokeTarget(stagingUrl, linkedRef);

  const runId = randomUUID();
  const identities = MATRIX_PRINCIPALS.map((definition) =>
    createEphemeralMatrixIdentity(definition, runId),
  );
  const admin = createClient(stagingUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const provisioned: ProvisionedIdentity[] = [];
  let runnerFailure: Error | null = null;

  try {
    for (const identity of identities) {
      provisioned.push(
        await provisionIdentity(admin, identity, stagingUrl, publishableKey),
      );
    }
    const exitCode = await runPlaywright({
      ...process.env,
      ...matrixEnvironment(identities),
      ORHA_E2E_BASE_URL: "",
    });
    if (exitCode !== 0) {
      runnerFailure = new Error(`A matriz E2E terminou com código ${exitCode}.`);
    }
  } catch (error) {
    runnerFailure = error instanceof Error ? error : new Error(String(error));
  }

  let cleanupFailure: Error | null = null;
  try {
    await cleanupMatrix(admin, provisioned);
  } catch (error) {
    cleanupFailure = error instanceof Error ? error : new Error(String(error));
  }

  if (runnerFailure || cleanupFailure) {
    throw new AggregateError(
      [runnerFailure, cleanupFailure].filter((error): error is Error => Boolean(error)),
      "A matriz E2E efêmera de staging não concluiu todos os gates.",
    );
  }
  console.log("Matriz E2E efêmera: cinco identidades removidas e cleanup verificado.");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  if (error instanceof AggregateError) {
    for (const cause of error.errors) {
      console.error(`- ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  }
  process.exitCode = 1;
});
