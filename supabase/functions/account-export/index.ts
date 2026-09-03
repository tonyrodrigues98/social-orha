import { buildAccountExport, encodeAccountExport, sha256Hex } from "../_shared/account-export.ts";
import { claimLifecycle, failLifecycle } from "../_shared/database.ts";
import { assertPost, corsHeaders, errorResponse, jsonResponse, optionsResponse, parseJsonObject } from "../_shared/http.ts";
import { createServiceClient, EdgeHttpError, requireAuthenticatedUser } from "../_shared/runtime.ts";

const artifactBucket = "account-exports";
const artifactTtlMilliseconds = 24 * 60 * 60 * 1000;
const signedUrlTtlSeconds = 5 * 60;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ArtifactRow = {
  id: string;
  request_id: string;
  user_id: string;
  bucket_id: string;
  object_path: string;
  byte_size: number;
  sha256: string;
  expires_at: string;
};

async function signedArtifactResponse(
  request: Request,
  service: ReturnType<typeof createServiceClient>,
  artifact: ArtifactRow,
) {
  if (new Date(artifact.expires_at).getTime() <= Date.now()) {
    throw new EdgeHttpError(410, "export_expired", "Esta exportação expirou. Solicite uma nova.");
  }
  const { data, error } = await service.storage
    .from(artifact.bucket_id)
    .createSignedUrl(artifact.object_path, signedUrlTtlSeconds, { download: "orha-dados.json" });
  if (error || !data?.signedUrl) {
    throw new EdgeHttpError(500, "export_signing_failed", "Não foi possível autorizar o download.");
  }
  return jsonResponse(request, {
    artifact: {
      requestId: artifact.request_id,
      downloadUrl: data.signedUrl,
      downloadUrlExpiresAt: new Date(Date.now() + signedUrlTtlSeconds * 1000).toISOString(),
      artifactExpiresAt: artifact.expires_at,
      byteSize: artifact.byte_size,
      sha256: artifact.sha256,
    },
  });
}

async function handle(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    try {
      return optionsResponse(request);
    } catch (cause) {
      return errorResponse(request, cause);
    }
  }

  let claimedRequestId: string | null = null;
  let uploadedObjectPath: string | null = null;
  let artifactCommitted = false;
  let service: ReturnType<typeof createServiceClient> | null = null;

  try {
    assertPost(request);
    corsHeaders(request);
    service = createServiceClient();
    const [{ user }, body] = await Promise.all([
      requireAuthenticatedUser(request),
      parseJsonObject(request),
    ]);
    const requestId = typeof body.requestId === "string" ? body.requestId : "";
    if (!uuidPattern.test(requestId)) {
      throw new EdgeHttpError(400, "invalid_request_id", "A solicitação de exportação é inválida.");
    }

    const existing = await service
      .from("account_export_artifacts")
      .select("id,request_id,user_id,bucket_id,object_path,byte_size,sha256,expires_at")
      .eq("request_id", requestId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (existing.error) throw new EdgeHttpError(500, "export_lookup_failed", "A exportação está indisponível.");
    if (existing.data) return signedArtifactResponse(request, service, existing.data as ArtifactRow);

    const lifecycle = await claimLifecycle(service, { kind: "data_export", requestId, userId: user.id });
    if (!lifecycle) {
      throw new EdgeHttpError(
        409,
        "export_not_claimable",
        "A exportação já está sendo processada ou não está disponível.",
      );
    }
    claimedRequestId = lifecycle.id;

    const exported = await buildAccountExport(service, { requestId: lifecycle.id, user });
    const bytes = encodeAccountExport(exported);
    const sha256 = await sha256Hex(bytes);
    const objectPath = `${user.id}/${lifecycle.id}/${crypto.randomUUID()}.json`;
    const artifactExpiresAt = new Date(Date.now() + artifactTtlMilliseconds).toISOString();

    const upload = await service.storage.from(artifactBucket).upload(objectPath, bytes, {
      cacheControl: "private, max-age=0, no-store",
      contentType: "application/json",
      upsert: false,
    });
    if (upload.error) throw new EdgeHttpError(500, "export_upload_failed", "Não foi possível armazenar a exportação.");
    uploadedObjectPath = objectPath;

    // Metadata registration and lifecycle completion are one PostgreSQL transaction.
    const artifactResult = await service.rpc("create_account_export_artifact", {
      p_request_id: lifecycle.id,
      p_user_id: user.id,
      p_object_path: objectPath,
      p_byte_size: bytes.byteLength,
      p_sha256: sha256,
      p_expires_at: artifactExpiresAt,
    });
    const artifact = Array.isArray(artifactResult.data) ? artifactResult.data[0] : artifactResult.data;
    if (artifactResult.error || !artifact) {
      // Do not remove an object after an uncertain commit. A stale retry reconciles it, and the
      // orphan worker removes it if the transaction definitely did not commit.
      throw new EdgeHttpError(500, "export_registration_failed", "Não foi possível registrar a exportação.");
    }

    artifactCommitted = true;
    claimedRequestId = null;
    uploadedObjectPath = null;
    return signedArtifactResponse(request, service, artifact as ArtifactRow);
  } catch (cause) {
    if (!artifactCommitted && claimedRequestId && service && !uploadedObjectPath) {
      await failLifecycle(service, claimedRequestId, "export_processing_failed");
    }
    return errorResponse(request, cause);
  }
}

export default { fetch: handle };
