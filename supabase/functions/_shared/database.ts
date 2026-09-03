import type { SupabaseClient } from "npm:@supabase/supabase-js@2.112.2";
import { EdgeHttpError } from "./runtime.ts";

export type LifecycleRequestRow = {
  id: string;
  user_id: string;
  kind: "data_export" | "deactivate" | "delete";
  status: "pending" | "processing" | "completed" | "cancelled" | "failed";
  execute_after: string;
};

export function rpcRow<T>(value: unknown): T | null {
  const row = Array.isArray(value) ? value[0] : value;
  return row && typeof row === "object" ? row as T : null;
}

export async function claimLifecycle(
  service: SupabaseClient,
  input: { kind: LifecycleRequestRow["kind"]; requestId?: string; userId?: string },
): Promise<LifecycleRequestRow | null> {
  const { data, error } = await service.rpc("claim_account_lifecycle_request", {
    p_kind: input.kind,
    p_request_id: input.requestId ?? null,
    p_user_id: input.userId ?? null,
  });
  if (error) throw new EdgeHttpError(500, "lifecycle_claim_failed", "A fila da conta está indisponível.");
  return rpcRow<LifecycleRequestRow>(data);
}

export async function completeLifecycle(
  service: SupabaseClient,
  requestId: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await service.rpc("complete_account_lifecycle_request", {
    p_request_id: requestId,
    p_metadata: metadata,
  });
  if (error) throw new EdgeHttpError(500, "lifecycle_completion_failed", "A conclusão da conta falhou.");
}

export async function failLifecycle(
  service: SupabaseClient,
  requestId: string,
  errorCode: string,
): Promise<void> {
  await service.rpc("fail_account_lifecycle_request", {
    p_request_id: requestId,
    p_error_code: errorCode,
  });
}

export async function retryLifecycle(
  service: SupabaseClient,
  requestId: string,
  errorCode: string,
): Promise<void> {
  const { error } = await service.rpc("record_account_lifecycle_retry", {
    p_request_id: requestId,
    p_error_code: errorCode,
  });
  if (error) throw new EdgeHttpError(500, "lifecycle_retry_failed", "A nova tentativa da conta não pôde ser registrada.");
}

export function isAlreadyAbsent(error: { code?: string } | null): boolean {
  return error?.code === "P0002";
}
