import type { SupabaseClient } from "npm:@supabase/supabase-js@2.112.2";
import { claimLifecycle, completeLifecycle, retryLifecycle } from "../_shared/database.ts";
import { assertPost, errorResponse, jsonResponse, parseJsonObject } from "../_shared/http.ts";
import { createServiceClient, EdgeHttpError } from "../_shared/runtime.ts";
import { requireCronAuthorization } from "../_shared/worker-auth.ts";

type StorageObjectRow = { bucket_id: string; object_path: string };
type DeletionTombstone = { request_id: string; user_id: string; storage_object_count: number };

function normalizedLimit(value: unknown): number {
  const parsed = typeof value === "number" && Number.isInteger(value) ? value : 10;
  return Math.min(Math.max(parsed, 1), 25);
}

async function listAllUserObjects(service: SupabaseClient, userId: string): Promise<StorageObjectRow[]> {
  const rows: StorageObjectRow[] = [];
  for (let offset = 0; offset < 10_000; offset += 500) {
    const { data, error } = await service
      .rpc("list_user_storage_objects", { p_user_id: userId })
      .range(offset, offset + 499);
    if (error) throw new EdgeHttpError(500, "storage_inventory_failed", "O inventário de arquivos falhou.");
    const page = (data ?? []) as StorageObjectRow[];
    rows.push(...page);
    if (page.length < 500) return rows;
  }
  throw new EdgeHttpError(500, "storage_inventory_limit", "A conta requer exclusão assistida.");
}

async function removeUserObjects(service: SupabaseClient, objects: readonly StorageObjectRow[]): Promise<void> {
  const buckets = new Map<string, string[]>();
  for (const object of objects) {
    const paths = buckets.get(object.bucket_id) ?? [];
    paths.push(object.object_path);
    buckets.set(object.bucket_id, paths);
  }
  for (const [bucket, paths] of buckets) {
    for (let offset = 0; offset < paths.length; offset += 100) {
      const { error } = await service.storage.from(bucket).remove(paths.slice(offset, offset + 100));
      if (error) throw new EdgeHttpError(500, "storage_cleanup_failed", "A remoção de arquivos falhou.");
    }
  }
}

async function reconcileCompletedDeletions(service: SupabaseClient, limit: number): Promise<number> {
  const { data, error } = await service.rpc("list_account_deletion_reconciliation", { p_limit: limit });
  if (error) throw new EdgeHttpError(500, "deletion_reconciliation_failed", "A reconciliação de contas falhou.");
  let completed = 0;
  for (const row of (data ?? []) as DeletionTombstone[]) {
    const result = await service.rpc("record_account_deletion_completed", {
      p_request_id: row.request_id,
      p_user_id: row.user_id,
      p_storage_object_count: row.storage_object_count,
    });
    if (!result.error) completed += 1;
  }
  return completed;
}

async function processDeactivations(service: SupabaseClient, limit: number): Promise<number> {
  let processed = 0;
  for (let index = 0; index < limit; index += 1) {
    const lifecycle = await claimLifecycle(service, { kind: "deactivate" });
    if (!lifecycle) break;
    try {
      await completeLifecycle(service, lifecycle.id, { account_restriction_persisted: true });
      processed += 1;
    } catch {
      await retryLifecycle(service, lifecycle.id, "deactivation_completion_failed");
    }
  }
  return processed;
}

async function processDeletions(service: SupabaseClient, limit: number): Promise<{ deleted: number; failed: number }> {
  let deleted = 0;
  let failed = 0;
  for (let index = 0; index < limit; index += 1) {
    const lifecycle = await claimLifecycle(service, { kind: "delete" });
    if (!lifecycle) break;
    try {
      // Destructive work starts only after durable tombstone/audit evidence exists.
      const objects = await listAllUserObjects(service, lifecycle.user_id);
      const started = await service.rpc("record_account_deletion_started", {
        p_request_id: lifecycle.id,
        p_storage_object_count: objects.length,
      });
      if (started.error) throw new EdgeHttpError(500, "deletion_audit_failed", "A auditoria da exclusão falhou.");

      const prepared = await service.rpc("prepare_account_deletion", { p_request_id: lifecycle.id });
      if (prepared.error) {
        throw new EdgeHttpError(500, "deletion_content_preparation_failed", "A preparação segura da conta falhou.");
      }

      await removeUserObjects(service, objects);
      const remaining = await listAllUserObjects(service, lifecycle.user_id);
      if (remaining.length > 0) {
        throw new EdgeHttpError(500, "storage_cleanup_incomplete", "Ainda existem arquivos privados da conta.");
      }

      // Auth is deliberately the last destructive authority call.
      const deletion = await service.auth.admin.deleteUser(lifecycle.user_id, false);
      if (deletion.error) throw new EdgeHttpError(500, "auth_user_deletion_failed", "A exclusão da conta Auth falhou.");

      // If this write is interrupted, the next cron invocation reconciles the tombstone.
      const completed = await service.rpc("record_account_deletion_completed", {
        p_request_id: lifecycle.id,
        p_user_id: lifecycle.user_id,
        p_storage_object_count: objects.length,
      });
      if (completed.error) {
        throw new EdgeHttpError(500, "deletion_completion_audit_failed", "A conclusão auditada da exclusão falhou.");
      }
      deleted += 1;
    } catch {
      const profile = await service.from("profiles").select("id").eq("id", lifecycle.user_id).maybeSingle();
      if (!profile.error && profile.data) {
        await retryLifecycle(service, lifecycle.id, "account_deletion_failed");
      }
      failed += 1;
    }
  }
  return { deleted, failed };
}

async function handle(request: Request): Promise<Response> {
  try {
    assertPost(request);
    await requireCronAuthorization(request);
    const body = await parseJsonObject(request);
    const limit = normalizedLimit(body.limit);
    const service = createServiceClient();

    const reconciled = await reconcileCompletedDeletions(service, limit);
    const deactivated = await processDeactivations(service, limit);
    const deletions = await processDeletions(service, limit);
    return jsonResponse(request, {
      ok: true,
      reconciled,
      deactivated,
      deleted: deletions.deleted,
      failed: deletions.failed,
    });
  } catch (cause) {
    return errorResponse(request, cause);
  }
}

export default { fetch: handle };
