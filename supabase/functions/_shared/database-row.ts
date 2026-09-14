export type LifecycleRequestRow = {
  id: string;
  user_id: string;
  kind: "data_export" | "deactivate" | "delete";
  status: "pending" | "processing" | "completed" | "cancelled" | "failed";
  execute_after: string;
};

const lifecycleKinds = new Set<LifecycleRequestRow["kind"]>([
  "data_export",
  "deactivate",
  "delete",
]);
const lifecycleStatuses = new Set<LifecycleRequestRow["status"]>([
  "pending",
  "processing",
  "completed",
  "cancelled",
  "failed",
]);

/** PostgREST may encode a NULL composite as one object whose fields are all null. */
export function parseLifecycleRpcRow(value: unknown): LifecycleRequestRow | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (candidate === null || candidate === undefined) return null;
  if (typeof candidate !== "object") throw new TypeError("invalid_lifecycle_rpc_row");

  const row = candidate as Record<string, unknown>;
  if (Object.values(row).length > 0 && Object.values(row).every((field) => field === null)) {
    return null;
  }
  if (
    typeof row.id !== "string"
    || row.id.length === 0
    || typeof row.user_id !== "string"
    || row.user_id.length === 0
    || !lifecycleKinds.has(row.kind as LifecycleRequestRow["kind"])
    || !lifecycleStatuses.has(row.status as LifecycleRequestRow["status"])
    || typeof row.execute_after !== "string"
    || row.execute_after.length === 0
  ) {
    throw new TypeError("invalid_lifecycle_rpc_row");
  }
  return row as LifecycleRequestRow;
}
