import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
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

type ProfileMedia = {
  id: string;
  profile_id: string;
  bucket_id: string;
  object_path: string;
  status: string;
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

export function parseProfileMedia(
  value: unknown,
  expectedUserId: string,
  expectedMediaId?: string,
): ProfileMedia {
  const candidate =
    value && typeof value === "object" && "media" in value
      ? (value as { media?: unknown }).media
      : value;
  const row = Array.isArray(candidate) ? candidate[0] : candidate;
  if (!row || typeof row !== "object")
    throw new Error("Missing profile media contract.");
  const media = row as Record<string, unknown>;
  if (
    typeof media.id !== "string" ||
    (expectedMediaId && media.id !== expectedMediaId) ||
    media.profile_id !== expectedUserId ||
    media.bucket_id !== "profile-media" ||
    typeof media.object_path !== "string" ||
    !media.object_path.startsWith(`${expectedUserId}/`) ||
    typeof media.status !== "string"
  ) {
    throw new Error("Invalid profile media ownership contract.");
  }
  return media as ProfileMedia;
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

  const profileMedia = await admin
    .from("profile_media")
    .select("bucket_id,object_path")
    .eq("profile_id", userId);
  if (profileMedia.error)
    throw new Error("Could not enumerate temporary profile media for cleanup.");
  for (const row of profileMedia.data ?? []) {
    const removal = await admin.storage
      .from(row.bucket_id)
      .remove([row.object_path]);
    if (removal.error)
      throw new Error("Could not remove temporary profile media.");
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

    let catalogResponse: Response | null = null;
    let catalogBody: { items?: unknown } | null = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      catalogResponse = await invoke(
        normalized,
        "catalog-search",
        accessToken,
        {
          category: "books",
          query: "Narnia",
          limit: 3,
        },
      );
      catalogBody = (await catalogResponse.json().catch(() => null)) as {
        items?: unknown;
      } | null;
      if (catalogResponse.ok && Array.isArray(catalogBody?.items)) break;
      if (
        ![429, 502, 503, 504].includes(catalogResponse.status) ||
        attempt === 3
      )
        break;
      await delay(attempt * 500);
    }
    if (
      !catalogResponse ||
      !catalogResponse.ok ||
      !Array.isArray(catalogBody?.items) ||
      catalogBody.items.length < 1
    ) {
      throw new Error(
        `catalog-search contract failed with status ${catalogResponse?.status ?? "no_response"}.`,
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

    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );
    const reserved = await userClient.rpc("reserve_profile_media", {
      p_purpose: "gallery",
      p_mime_type: "image/png",
      p_byte_size: png.byteLength,
      p_width: 1,
      p_height: 1,
    });
    if (reserved.error)
      throw new Error("Could not reserve temporary profile media.");
    const reservedMedia = parseProfileMedia(reserved.data, userId);
    if (reservedMedia.status !== "pending")
      throw new Error("Profile media reservation was not pending.");
    checks.push("profile-media-reserved");

    const upload = await userClient.storage
      .from(reservedMedia.bucket_id)
      .upload(reservedMedia.object_path, png, {
        contentType: "image/png",
        cacheControl: "private, max-age=0, no-store",
        upsert: false,
      });
    if (upload.error)
      throw new Error("Could not upload temporary profile media.");
    checks.push("profile-media-uploaded-private");

    const mediaResponse = await invoke(
      normalized,
      "media-verify",
      accessToken,
      { scope: "profile", mediaId: reservedMedia.id },
    );
    const mediaBody: unknown = await mediaResponse.json().catch(() => null);
    if (!mediaResponse.ok)
      throw new Error(
        `media-verify failed with status ${mediaResponse.status}.`,
      );
    const verifiedMedia = parseProfileMedia(
      mediaBody,
      userId,
      reservedMedia.id,
    );
    if (verifiedMedia.status !== "ready")
      throw new Error("Verified profile media was not promoted.");
    checks.push("profile-media-binary-verified");

    const signedUrl = await userClient.storage
      .from(verifiedMedia.bucket_id)
      .createSignedUrl(verifiedMedia.object_path, 60);
    if (signedUrl.error || !signedUrl.data.signedUrl)
      throw new Error("Could not authorize temporary profile media download.");
    const mediaDownload = await fetch(signedUrl.data.signedUrl, {
      signal: AbortSignal.timeout(20_000),
    });
    const downloadedMedia = Buffer.from(await mediaDownload.arrayBuffer());
    if (!mediaDownload.ok || !downloadedMedia.equals(png))
      throw new Error(
        "Private profile media download failed integrity validation.",
      );
    checks.push("profile-media-signed-download");

    const removed = await userClient.rpc("remove_profile_media", {
      p_media_id: verifiedMedia.id,
    });
    if (removed.error)
      throw new Error("Could not schedule temporary profile media removal.");
    const deletingMedia = parseProfileMedia(
      removed.data,
      userId,
      verifiedMedia.id,
    );
    if (deletingMedia.status !== "deleting")
      throw new Error("Profile media removal was not queued.");
    checks.push("profile-media-removal-queued");

    const objectRemoval = await admin.storage
      .from(deletingMedia.bucket_id)
      .remove([deletingMedia.object_path]);
    if (objectRemoval.error)
      throw new Error("Could not remove queued profile media object.");
    const metadataRemoval = await admin.rpc("complete_profile_media_cleanup", {
      p_media_id: deletingMedia.id,
    });
    if (metadataRemoval.error)
      throw new Error("Could not complete queued profile media cleanup.");
    const remaining = await admin
      .from("profile_media")
      .select("id")
      .eq("id", deletingMedia.id)
      .maybeSingle();
    if (remaining.error || remaining.data)
      throw new Error("Profile media metadata remained after cleanup.");
    checks.push("profile-media-storage-metadata-cleanup");
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
