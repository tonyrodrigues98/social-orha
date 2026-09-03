import type { SupabaseClient } from "npm:@supabase/supabase-js@2.112.2";
import { isAlreadyAbsent } from "../_shared/database.ts";
import { assertPost, errorResponse, jsonResponse, parseJsonObject } from "../_shared/http.ts";
import { createServiceClient, EdgeHttpError } from "../_shared/runtime.ts";
import { requireCronAuthorization } from "../_shared/worker-auth.ts";

type CleanupRow = {
  id?: string;
  attachment_id?: string;
  bucket_id: string;
  object_path: string;
  delete_object?: boolean;
};

type CleanupContract = {
  listRpc: string;
  completeRpc: string;
  identifier: (row: CleanupRow) => string;
  completeArgument: string;
  shouldDeleteObject?: (row: CleanupRow) => boolean;
};

const contracts: readonly CleanupContract[] = [
  {
    listRpc: "list_profile_media_cleanup",
    completeRpc: "complete_profile_media_cleanup",
    identifier: (row) => row.id ?? "",
    completeArgument: "p_media_id",
  },
  {
    listRpc: "list_post_media_cleanup",
    completeRpc: "complete_post_media_cleanup",
    identifier: (row) => row.id ?? "",
    completeArgument: "p_media_id",
  },
  {
    listRpc: "list_message_attachment_cleanup",
    completeRpc: "complete_message_attachment_cleanup",
    identifier: (row) => row.attachment_id ?? "",
    completeArgument: "p_attachment_id",
    shouldDeleteObject: (row) => row.delete_object !== false,
  },
  {
    listRpc: "list_account_export_cleanup",
    completeRpc: "complete_account_export_cleanup",
    identifier: (row) => row.id ?? "",
    completeArgument: "p_artifact_id",
  },
  {
    listRpc: "list_report_evidence_cleanup",
    completeRpc: "complete_report_evidence_cleanup",
    identifier: (row) => row.id ?? "",
    completeArgument: "p_evidence_id",
  },
  {
    listRpc: "list_report_target_attachment_cleanup",
    completeRpc: "complete_report_target_attachment_cleanup",
    identifier: (row) => row.attachment_id ?? "",
    completeArgument: "p_attachment_id",
    shouldDeleteObject: (row) => row.delete_object !== false,
  },
] as const;

function normalizedLimit(value: unknown): number {
  const parsed = typeof value === "number" && Number.isInteger(value) ? value : 50;
  return Math.min(Math.max(parsed, 1), 100);
}

async function removeObject(service: SupabaseClient, bucket: string, objectPath: string): Promise<void> {
  const removal = await service.storage.from(bucket).remove([objectPath]);
  if (removal.error) throw removal.error;
}

async function processContract(
  service: SupabaseClient,
  contract: CleanupContract,
  limit: number,
): Promise<{ completed: number; failed: number }> {
  const listing = await service.rpc(contract.listRpc, { p_limit: limit });
  if (listing.error) throw new EdgeHttpError(500, "cleanup_listing_failed", "A fila de limpeza está indisponível.");

  let completed = 0;
  let failed = 0;
  for (const row of (listing.data ?? []) as CleanupRow[]) {
    const identifier = contract.identifier(row);
    if (!identifier || !row.bucket_id || !row.object_path) {
      failed += 1;
      continue;
    }
    try {
      let shouldDeleteObject = contract.shouldDeleteObject?.(row) !== false;
      if (shouldDeleteObject && (row.bucket_id === "chat-media" || row.bucket_id === "community-media")) {
        const retained = await service.rpc("is_report_target_attachment_retained", {
          p_bucket_id: row.bucket_id,
          p_object_path: row.object_path,
        });
        if (retained.error) throw retained.error;
        shouldDeleteObject = retained.data !== true;
      }
      if (shouldDeleteObject) await removeObject(service, row.bucket_id, row.object_path);
      const completion = await service.rpc(contract.completeRpc, { [contract.completeArgument]: identifier });
      if (completion.error && !isAlreadyAbsent(completion.error)) throw completion.error;
      completed += 1;
    } catch {
      failed += 1;
    }
  }
  return { completed, failed };
}

async function processBranding(service: SupabaseClient, limit: number): Promise<{ completed: number; failed: number }> {
  const listing = await service.rpc("list_community_branding_cleanup", { p_limit: limit });
  if (listing.error) throw new EdgeHttpError(500, "branding_cleanup_listing_failed", "A limpeza de identidade visual está indisponível.");
  let completed = 0;
  let failed = 0;
  for (const row of (listing.data ?? []) as Array<{
    cleanup_kind: string;
    cleanup_id: string;
    bucket_id: string;
    object_path: string;
  }>) {
    try {
      await removeObject(service, row.bucket_id, row.object_path);
      const completion = await service.rpc("complete_community_branding_cleanup", {
        p_cleanup_kind: row.cleanup_kind,
        p_cleanup_id: row.cleanup_id,
      });
      if (completion.error && !isAlreadyAbsent(completion.error)) throw completion.error;
      completed += 1;
    } catch {
      failed += 1;
    }
  }
  return { completed, failed };
}

async function processOrphans(service: SupabaseClient, limit: number): Promise<{ completed: number; failed: number }> {
  const reconciliation = await service.rpc("list_orphan_media_cleanup_reconciliation", { p_limit: limit });
  if (reconciliation.error) {
    throw new EdgeHttpError(500, "orphan_reconciliation_failed", "A reconciliação de uploads órfãos está indisponível.");
  }
  let completed = 0;
  let failed = 0;
  for (const row of (reconciliation.data ?? []) as Array<{ bucket_id: string; object_path: string }>) {
    const completion = await service.rpc("complete_orphan_media_upload_cleanup", {
      p_bucket_id: row.bucket_id,
      p_object_path: row.object_path,
    });
    if (completion.error && !isAlreadyAbsent(completion.error)) failed += 1;
    else completed += 1;
  }

  const listing = await service.rpc("list_orphan_media_upload_cleanup", { p_limit: limit });
  if (listing.error) throw new EdgeHttpError(500, "orphan_cleanup_listing_failed", "A limpeza de uploads órfãos está indisponível.");
  for (const row of (listing.data ?? []) as Array<{ bucket_id: string; object_path: string }>) {
    try {
      const claim = await service.rpc("claim_orphan_media_upload_cleanup", {
        p_bucket_id: row.bucket_id,
        p_object_path: row.object_path,
      });
      if (claim.error) throw claim.error;
      if (claim.data !== true) continue;
      await removeObject(service, row.bucket_id, row.object_path);
      const completion = await service.rpc("complete_orphan_media_upload_cleanup", {
        p_bucket_id: row.bucket_id,
        p_object_path: row.object_path,
      });
      if (completion.error && !isAlreadyAbsent(completion.error)) throw completion.error;
      completed += 1;
    } catch {
      failed += 1;
    }
  }
  return { completed, failed };
}

async function handle(request: Request): Promise<Response> {
  try {
    assertPost(request);
    await requireCronAuthorization(request);
    const body = await parseJsonObject(request);
    const limit = normalizedLimit(body.limit);
    const service = createServiceClient();
    const results: Record<string, { completed: number; failed: number }> = {};
    for (const contract of contracts) {
      results[contract.listRpc] = await processContract(service, contract, limit);
    }
    results.list_community_branding_cleanup = await processBranding(service, limit);
    results.list_orphan_media_upload_cleanup = await processOrphans(service, limit);
    return jsonResponse(request, { ok: true, results });
  } catch (cause) {
    return errorResponse(request, cause);
  }
}

export default { fetch: handle };
