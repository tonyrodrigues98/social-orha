import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AdministrationError,
  type AdministrationRepository,
  type AssignGlobalRoleInput,
  type GlobalRoleAssignment,
  type GlobalRoleAssignmentPage,
  type GlobalRoleAssignmentRequest,
} from "@/domains/administration";
import type { Database } from "../database.types";
import { getSupabaseClient } from "../client";

type RoleRow = Database["public"]["Functions"]["list_global_role_assignments"]["Returns"][number];
type SupabaseErrorLike = { code?: string; message?: string; status?: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function mapAdministrationError(error: unknown): AdministrationError {
  if (error instanceof AdministrationError) return error;
  const source = (error ?? {}) as SupabaseErrorLike;
  if (source.status === 401 || source.code === "PGRST301") {
    return new AdministrationError("authentication", "Sua sessão expirou. Entre novamente.", { cause: error });
  }
  if (source.status === 403 || source.code === "42501") {
    return new AdministrationError("permission", "Sua função não permite esta alteração.", { cause: error });
  }
  if (source.status === 409 || source.code === "23505") {
    return new AdministrationError("conflict", "A conta já possui essa função ou foi alterada em outra sessão.", { cause: error });
  }
  if (source.status === 429 || source.code === "PT429") {
    return new AdministrationError("rate_limit", "Muitas alterações em pouco tempo. Aguarde e tente novamente.", { cause: error });
  }
  if (source.status === 400 || source.code === "22023" || source.code === "23514") {
    return new AdministrationError("validation", "Revise a conta, a função e o motivo informados.", { cause: error });
  }
  if (source.status === 404 || source.code === "P0002" || source.code === "PGRST116") {
    return new AdministrationError("unavailable", "A conta não está disponível para atribuição.", { cause: error });
  }
  if (source.status === 503 || source.status === 504 || source.code === "PGRST003") {
    return new AdministrationError("unavailable", "A administração está temporariamente indisponível.", { cause: error });
  }
  if (error instanceof TypeError || /fetch|network|offline/i.test(source.message ?? "")) {
    return new AdministrationError("network", "Sem conexão com o servidor. Verifique sua internet.", { cause: error });
  }
  return new AdministrationError("unknown", "Não foi possível concluir a alteração de função.", { cause: error });
}

function mapRoleRow(row: RoleRow): GlobalRoleAssignment {
  return {
    userId: row.user_id,
    fullName: row.full_name?.trim() || "Membro ORHA",
    username: row.username,
    role: row.role,
    updatedAt: row.updated_at,
  };
}

function encodeCursor(timestamp: string, id: string) {
  return `${timestamp}|${id}`;
}

function decodeCursor(value: string | null | undefined) {
  if (!value) return null;
  const separator = value.lastIndexOf("|");
  const timestamp = value.slice(0, separator);
  const id = value.slice(separator + 1);
  if (separator < 1 || Number.isNaN(Date.parse(timestamp)) || !UUID.test(id)) {
    throw new AdministrationError("validation", "A página solicitada não é válida.");
  }
  return { timestamp: new Date(timestamp).toISOString(), id };
}

function normalizedLimit(value: number | undefined) {
  if (!Number.isFinite(value)) return 30;
  return Math.min(49, Math.max(1, Math.trunc(value ?? 30)));
}

export class SupabaseAdministrationRepository implements AdministrationRepository {
  constructor(private readonly client: SupabaseClient<Database> = getSupabaseClient()) {}

  async listGlobalRoleAssignments(
    request: GlobalRoleAssignmentRequest = {},
  ): Promise<GlobalRoleAssignmentPage> {
    const query = request.query?.trim() || undefined;
    if (query && (query.length < 2 || query.length > 64)) {
      throw new AdministrationError("validation", "Pesquise usando entre 2 e 64 caracteres.");
    }
    const limit = normalizedLimit(request.limit);
    const cursor = decodeCursor(request.cursor);
    let operation = this.client.rpc("list_global_role_assignments", {
      p_query: query,
      p_limit: limit + 1,
      p_before_updated_at: cursor?.timestamp,
      p_before_user_id: cursor?.id,
    });
    if (request.signal) operation = operation.abortSignal(request.signal);
    const { data, error } = await operation;
    if (error) throw mapAdministrationError(error);
    const rows = data ?? [];
    const hasMore = rows.length > limit;
    const visible = rows.slice(0, limit);
    const last = visible.at(-1);
    return {
      items: visible.map(mapRoleRow),
      nextCursor: hasMore && last ? encodeCursor(last.updated_at, last.user_id) : null,
    };
  }

  async assignGlobalRole(input: AssignGlobalRoleInput): Promise<GlobalRoleAssignment> {
    if (!UUID.test(input.targetUserId) || input.reason.trim().length < 12 || input.reason.trim().length > 500) {
      throw new AdministrationError("validation", "Informe uma conta válida e um motivo entre 12 e 500 caracteres.");
    }
    const { data, error } = await this.client.rpc("assign_global_role", {
      p_target_user_id: input.targetUserId,
      p_role: input.role,
      p_reason: input.reason.trim(),
    });
    if (error) throw mapAdministrationError(error);
    const row = data?.[0];
    if (!row) throw new AdministrationError("unknown", "O servidor não confirmou a nova função.");
    return mapRoleRow(row);
  }
}

export function createSupabaseAdministrationRepository(client = getSupabaseClient()) {
  return new SupabaseAdministrationRepository(client);
}
