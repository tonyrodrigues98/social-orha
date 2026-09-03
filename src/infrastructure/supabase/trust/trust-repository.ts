import type { SupabaseClient } from "@supabase/supabase-js";
import {
  TrustError,
  decodeTrustCursor,
  encodeTrustCursor,
  validateCreateReport,
  validateModerationAction,
  type AccountAccessSummary,
  type AccountSecuritySummary,
  type AccountLifecycleKind,
  type AccountLifecycleRequest,
  type ApplyModerationActionInput,
  type BlockedProfile,
  type CreateReportInput,
  type CreateAccountLifecycleRequestInput,
  type ModerationAction,
  type ModerationReportAttachment,
  type ModerationReportContext,
  type ModerationQueueRequest,
  type Report,
  type TrustPage,
  type TrustPageRequest,
  type TrustProfileSummary,
  type TrustRepository,
} from "@/domains/trust";
import { getSupabaseClient } from "../client";

type SupabaseErrorShape = {
  code?: string;
  message?: string;
  status?: number;
};

type BlockRow = {
  id: string;
  blocked_id: string;
  blocked_profile?: unknown;
  created_at: string;
};

type ReportRow = {
  id: string;
  reporter_id: string;
  target_type: Report["targetType"];
  target_id: string;
  category: Report["category"];
  details: string | null;
  status: Report["status"];
  assigned_to: string | null;
  resolution: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

type ModerationActionRow = {
  id: string;
  case_id: string | null;
  imposed_by: string;
  target_type: ModerationAction["targetType"];
  target_id: string;
  action_type: ModerationAction["actionType"];
  reason: string;
  expires_at: string | null;
  created_at: string;
};

type ModerationReportContextRow = {
  report_id: string;
  target_type: ModerationReportContext["targetType"];
  target_id: string;
  target_owner_id: string | null;
  content_text: string | null;
  content_kind: string | null;
  content_created_at: string | null;
  attachment_ids: string[] | null;
};

type ModerationReportAttachmentRow = {
  attachment_id: string;
  source_kind: ModerationReportAttachment["sourceKind"];
  bucket_id: string;
  object_path: string;
  mime_type: string;
  byte_size: number;
  duration_seconds: number | string | null;
  waveform: unknown;
  width: number | null;
  height: number | null;
};

const MODERATION_MEDIA_URL_SECONDS = 60;
const moderationMediaBuckets = new Set(["chat-media", "community-media"]);

type AccountLifecycleRow = {
  id: string;
  user_id: string;
  kind: string;
  status: string;
  requested_at: string;
  execute_after: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
};

type AccountAccessRow = {
  effective_status: AccountAccessSummary["effectiveStatus"];
  recorded_status: AccountAccessSummary["recordedStatus"];
  restricted_until: string | null;
  access_enabled: boolean;
};

type RecordedModerationRow = {
  public_reason: string | null;
};

export function mapTrustError(error: unknown): TrustError {
  if (error instanceof TrustError) return error;
  const source = (error ?? {}) as SupabaseErrorShape;
  const code = source.code ?? "";
  const status = source.status;
  if (code === "invalid_credentials") {
    return new TrustError("authentication", "A senha atual não foi confirmada.", { cause: error });
  }
  if (status === 401 || code === "PGRST301") {
    return new TrustError("authentication", "Sua sessão expirou. Entre novamente.", { cause: error });
  }
  if (status === 403 || code === "42501") {
    return new TrustError("permission", "Você não tem permissão para esta ação.", { cause: error });
  }
  if (status === 409 || code === "23505") {
    return new TrustError("conflict", "A operação já foi realizada ou entrou em conflito.", { cause: error });
  }
  if (status === 404 || code === "P0002" || code === "PGRST116") {
    return new TrustError("unavailable", "O conteúdo solicitado não está mais disponível.", { cause: error });
  }
  if (status === 429) {
    return new TrustError("rate_limit", "Muitas tentativas. Aguarde um momento.", { cause: error });
  }
  if (status === 503 || status === 504 || code === "PGRST003") {
    return new TrustError("unavailable", "O servidor está temporariamente indisponível.", { cause: error });
  }
  if (status === 400 || code === "22023" || code === "23514" || code === "23503") {
    return new TrustError("validation", "Os dados enviados não são válidos.", { cause: error });
  }
  if (error instanceof TypeError || /fetch|network|offline/i.test(source.message ?? "")) {
    return new TrustError("network", "Sem conexão com o servidor. Verifique sua internet.", { cause: error });
  }
  return new TrustError("unknown", "Não foi possível concluir a operação agora.", { cause: error });
}

function profileFromRelation(value: unknown): TrustProfileSummary | null {
  const relation = Array.isArray(value) ? value[0] : value;
  if (!relation || typeof relation !== "object") return null;
  const row = relation as Record<string, unknown>;
  if (typeof row.id !== "string") return null;
  return {
    id: row.id,
    fullName: typeof row.full_name === "string" ? row.full_name : null,
    username: typeof row.username === "string" ? row.username : null,
    avatarPath: typeof row.avatar_path === "string" ? row.avatar_path : null,
  };
}

export function mapBlockRow(row: BlockRow): BlockedProfile {
  return {
    id: row.id,
    blockedProfileId: row.blocked_id,
    blockedProfile: profileFromRelation(row.blocked_profile),
    createdAt: row.created_at,
  };
}

export function mapReportRow(row: ReportRow): Report {
  return {
    id: row.id,
    reporterId: row.reporter_id,
    targetType: row.target_type,
    targetId: row.target_id,
    category: row.category,
    details: row.details,
    status: row.status,
    assignedTo: row.assigned_to,
    resolution: row.resolution,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at,
  };
}

export function mapModerationActionRow(
  row: ModerationActionRow,
  reportId: string,
): ModerationAction {
  return {
    id: row.id,
    reportId,
    moderatorId: row.imposed_by,
    targetType: row.target_type,
    targetId: row.target_id,
    actionType: row.action_type,
    reason: row.reason,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

export function mapModerationReportContextRow(
  row: ModerationReportContextRow,
): ModerationReportContext {
  return {
    reportId: row.report_id,
    targetType: row.target_type,
    targetId: row.target_id,
    targetOwnerId: row.target_owner_id,
    contentText: row.content_text,
    contentKind: row.content_kind,
    contentCreatedAt: row.content_created_at,
    attachmentIds: row.attachment_ids ?? [],
  };
}

function waveformFromDatabase(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const samples = value.filter(
    (sample): sample is number => typeof sample === "number" && Number.isFinite(sample),
  );
  return samples.length === value.length ? samples : null;
}

export function mapModerationReportAttachmentRow(
  row: ModerationReportAttachmentRow,
  signedUrl: string,
): ModerationReportAttachment {
  return {
    attachmentId: row.attachment_id,
    sourceKind: row.source_kind,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    durationSeconds:
      row.duration_seconds === null ? null : Number(row.duration_seconds),
    waveform: waveformFromDatabase(row.waveform),
    width: row.width,
    height: row.height,
    signedUrl,
    signedUrlExpiresInSeconds: MODERATION_MEDIA_URL_SECONDS,
  };
}

function lifecycleKindFromDatabase(value: string): AccountLifecycleKind {
  if (value === "export" || value === "data_export") return "export";
  if (value === "deactivate") return "deactivate";
  if (value === "delete") return "delete";
  throw new TrustError("unavailable", "O servidor retornou um tipo de solicitação desconhecido.");
}

function lifecycleStatusFromDatabase(value: string): AccountLifecycleRequest["status"] {
  if (value === "pending") return value;
  if (value === "processing" || value === "completed" || value === "cancelled" || value === "failed") {
    return value;
  }
  throw new TrustError("unavailable", "O servidor retornou um estado de solicitação desconhecido.");
}

export function mapAccountLifecycleRow(row: AccountLifecycleRow): AccountLifecycleRequest {
  return {
    id: row.id,
    profileId: row.user_id,
    kind: lifecycleKindFromDatabase(row.kind),
    status: lifecycleStatusFromDatabase(row.status),
    requestedAt: row.requested_at,
    scheduledFor: row.execute_after,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at,
  };
}

function lifecycleKindToDatabase(kind: AccountLifecycleKind): string {
  if (kind === "export") return "data_export";
  return kind;
}

function rowFromRpc<T>(data: unknown): T {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") {
    throw new TrustError("unavailable", "O servidor não confirmou a operação.");
  }
  return row as T;
}

async function requireUser(client: SupabaseClient) {
  const { data, error } = await client.auth.getUser();
  if (error) throw mapTrustError(error);
  if (!data.user) throw new TrustError("authentication", "Entre para acessar sua conta.");
  return data.user;
}

async function confirmPassword(client: SupabaseClient, password: string) {
  if (!password) {
    throw new TrustError("validation", "Informe sua senha atual para confirmar esta ação.");
  }
  const currentUser = await requireUser(client);
  if (!currentUser.email) {
    throw new TrustError(
      "unavailable",
      "Esta conta não possui e-mail confirmado para reautenticação.",
    );
  }
  const { data, error } = await client.auth.signInWithPassword({
    email: currentUser.email,
    password,
  });
  if (error) throw mapTrustError(error);
  if (!data.user || data.user.id !== currentUser.id) {
    throw new TrustError("authentication", "Não foi possível confirmar a identidade desta conta.");
  }
  return currentUser;
}

export class SupabaseTrustRepository implements TrustRepository {
  constructor(private readonly client: SupabaseClient = getSupabaseClient()) {}

  async getBlockedProfile(profileId: string): Promise<BlockedProfile | null> {
    const user = await requireUser(this.client);
    const { data, error } = await this.client
      .from("blocks")
      .select("id,blocked_id,created_at,blocked_profile:profiles!blocks_blocked_id_fkey(id,full_name,username,avatar_path)")
      .eq("blocker_id", user.id)
      .eq("blocked_id", profileId)
      .maybeSingle();
    if (error) throw mapTrustError(error);
    if (!data) return null;
    return mapBlockRow(data as unknown as BlockRow);
  }

  async listBlockedProfiles(request: TrustPageRequest = {}): Promise<TrustPage<BlockedProfile>> {
    const limit = Math.min(Math.max(request.limit ?? 20, 1), 50);
    let query = this.client
      .from("blocks")
      .select("id,blocked_id,created_at,blocked_profile:profiles!blocks_blocked_id_fkey(id,full_name,username,avatar_path)")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);
    if (request.cursor) {
      const cursor = decodeTrustCursor(request.cursor);
      if (!cursor) throw new TrustError("validation", "O cursor de paginação é inválido.");
      query = query.or(
        `created_at.lt."${cursor.createdAt}",and(created_at.eq."${cursor.createdAt}",id.lt.${cursor.id})`,
      );
    }
    if (request.signal) query = query.abortSignal(request.signal);
    const { data, error } = await query;
    if (error) throw mapTrustError(error);
    const rows = (data ?? []) as unknown as BlockRow[];
    const visibleRows = rows.slice(0, limit);
    const last = visibleRows.at(-1);
    return {
      items: visibleRows.map(mapBlockRow),
      nextCursor:
        rows.length > limit && last
          ? encodeTrustCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  async blockProfile(profileId: string, reason?: string | null): Promise<BlockedProfile> {
    const { error } = await this.client.rpc("block_profile", {
      p_target_profile_id: profileId,
      p_reason: reason?.trim() || null,
    });
    if (error) throw mapTrustError(error);
    const block = await this.getBlockedProfile(profileId);
    if (!block) {
      throw new TrustError("unavailable", "O servidor não confirmou o bloqueio deste perfil.");
    }
    return block;
  }

  async unblockProfile(profileId: string): Promise<void> {
    const { error } = await this.client.rpc("unblock_profile", {
      p_target_profile_id: profileId,
    });
    if (error) throw mapTrustError(error);
  }

  async createReport(input: CreateReportInput): Promise<Report> {
    let validated: CreateReportInput;
    try {
      validated = validateCreateReport(input);
    } catch (cause) {
      throw new TrustError("validation", cause instanceof Error ? cause.message : "Denúncia inválida.", { cause });
    }
    const { data, error } = await this.client.rpc("create_report", {
      p_target_type: validated.targetType,
      p_target_id: validated.targetId,
      p_category: validated.category,
      p_details: validated.details ?? null,
    });
    if (error) throw mapTrustError(error);
    return mapReportRow(rowFromRpc<ReportRow>(data));
  }

  async listOwnReports(request: TrustPageRequest = {}): Promise<TrustPage<Report>> {
    const user = await requireUser(this.client);
    return this.listReports({ ...request, reporterId: user.id });
  }

  async listModerationQueue(request: ModerationQueueRequest = {}): Promise<TrustPage<Report>> {
    return this.listReports({ ...request, status: request.status });
  }

  async getModerationReportContext(reportId: string): Promise<ModerationReportContext> {
    const { data, error } = await this.client.rpc("get_moderation_report_context", {
      p_report_id: reportId,
    });
    if (error) throw mapTrustError(error);
    return mapModerationReportContextRow(rowFromRpc<ModerationReportContextRow>(data));
  }

  async getModerationReportAttachment(
    reportId: string,
    attachmentId: string,
  ): Promise<ModerationReportAttachment> {
    const { data, error } = await this.client.rpc("get_moderation_report_attachment", {
      p_report_id: reportId,
      p_attachment_id: attachmentId,
    });
    if (error) throw mapTrustError(error);
    const row = rowFromRpc<ModerationReportAttachmentRow>(data);
    if (!moderationMediaBuckets.has(row.bucket_id)) {
      throw new TrustError("unavailable", "O anexo denunciado não pertence a um destino autorizado.");
    }
    const signed = await this.client.storage
      .from(row.bucket_id)
      .createSignedUrl(row.object_path, MODERATION_MEDIA_URL_SECONDS);
    if (signed.error) throw mapTrustError(signed.error);
    if (!signed.data?.signedUrl) {
      throw new TrustError("unavailable", "O servidor não autorizou a leitura temporária do anexo.");
    }
    return mapModerationReportAttachmentRow(row, signed.data.signedUrl);
  }

  private async listReports(
    request: TrustPageRequest & { status?: ModerationQueueRequest["status"]; reporterId?: string },
  ): Promise<TrustPage<Report>> {
    const limit = Math.min(Math.max(request.limit ?? 20, 1), 50);
    let query = this.client
      .from("reports")
      .select("id,reporter_id,target_type,target_id,category,details,status,assigned_to,resolution,created_at,updated_at,resolved_at")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);
    if (request.reporterId) query = query.eq("reporter_id", request.reporterId);
    if (request.status && request.status !== "all") query = query.eq("status", request.status);
    if (request.cursor) {
      const cursor = decodeTrustCursor(request.cursor);
      if (!cursor) throw new TrustError("validation", "O cursor de paginação é inválido.");
      query = query.or(
        `created_at.lt."${cursor.createdAt}",and(created_at.eq."${cursor.createdAt}",id.lt.${cursor.id})`,
      );
    }
    if (request.signal) query = query.abortSignal(request.signal);
    const { data, error } = await query;
    if (error) throw mapTrustError(error);
    const rows = (data ?? []) as unknown as ReportRow[];
    const visibleRows = rows.slice(0, limit);
    const last = visibleRows.at(-1);
    return {
      items: visibleRows.map(mapReportRow),
      nextCursor:
        rows.length > limit && last
          ? encodeTrustCursor({ createdAt: last.created_at, id: last.id })
          : null,
    };
  }

  async applyModerationAction(input: ApplyModerationActionInput): Promise<ModerationAction> {
    let validated: ApplyModerationActionInput;
    try {
      validated = validateModerationAction(input);
    } catch (cause) {
      throw new TrustError("validation", cause instanceof Error ? cause.message : "Ação inválida.", { cause });
    }
    const { data, error } = await this.client.rpc("apply_moderation_action", {
      p_report_id: validated.reportId,
      p_action_type: validated.actionType,
      p_reason: validated.reason,
      p_expires_at: validated.expiresAt ?? null,
    });
    if (error) throw mapTrustError(error);
    return mapModerationActionRow(rowFromRpc<ModerationActionRow>(data), validated.reportId);
  }

  async getAccountSecurity(): Promise<AccountSecuritySummary> {
    const [{ data: userData, error: userError }, { data: sessionData, error: sessionError }] =
      await Promise.all([this.client.auth.getUser(), this.client.auth.getSession()]);
    if (userError) throw mapTrustError(userError);
    if (sessionError) throw mapTrustError(sessionError);
    if (!userData.user) throw new TrustError("authentication", "Entre para acessar sua conta.");
    const expiresAt = sessionData.session?.expires_at;
    return {
      userId: userData.user.id,
      email: userData.user.email ?? null,
      emailConfirmed: Boolean(userData.user.email_confirmed_at),
      lastSignInAt: userData.user.last_sign_in_at ?? null,
      sessionExpiresAt: expiresAt ? new Date(expiresAt * 1000).toISOString() : null,
    };
  }

  async getAccountAccess(): Promise<AccountAccessSummary> {
    const user = await requireUser(this.client);
    const [accessResult, moderationResult] = await Promise.all([
      this.client.rpc("get_own_account_status"),
      this.client
        .from("profile_moderation_state")
        .select("public_reason")
        .eq("profile_id", user.id)
        .single(),
    ]);
    if (accessResult.error) throw mapTrustError(accessResult.error);
    if (moderationResult.error) throw mapTrustError(moderationResult.error);
    const access = rowFromRpc<AccountAccessRow>(accessResult.data);
    const moderation = moderationResult.data as RecordedModerationRow;
    const reason = moderation.public_reason?.startsWith("account_lifecycle:")
      ? "Há uma solicitação de conta em andamento."
      : moderation.public_reason;
    return {
      effectiveStatus: access.effective_status,
      recordedStatus: access.recorded_status,
      accessEnabled: access.access_enabled,
      publicReason: reason,
      restrictedUntil: access.restricted_until,
    };
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    if (newPassword.length < 12) {
      throw new TrustError("validation", "A nova senha deve ter pelo menos 12 caracteres.");
    }
    await confirmPassword(this.client, currentPassword);
    const { error } = await this.client.auth.updateUser({ password: newPassword });
    if (error) throw mapTrustError(error);
  }

  async signOutEverywhere(): Promise<void> {
    const { error } = await this.client.auth.signOut({ scope: "global" });
    if (error) throw mapTrustError(error);
  }

  async listAccountLifecycleRequests(): Promise<AccountLifecycleRequest[]> {
    const user = await requireUser(this.client);
    const { data, error } = await this.client
      .from("account_lifecycle_requests")
      .select("id,user_id,kind,status,requested_at,execute_after,completed_at,cancelled_at")
      .eq("user_id", user.id)
      .order("requested_at", { ascending: false })
      .limit(20);
    if (error) throw mapTrustError(error);
    return ((data ?? []) as AccountLifecycleRow[]).map(mapAccountLifecycleRow);
  }

  async createAccountLifecycleRequest(
    input: CreateAccountLifecycleRequestInput,
  ): Promise<AccountLifecycleRequest> {
    if (input.kind !== "export") {
      await confirmPassword(this.client, input.currentPassword ?? "");
    }
    const { data, error } = await this.client.rpc("request_account_lifecycle", {
      p_kind: lifecycleKindToDatabase(input.kind),
      p_confirmation: input.kind === "export" ? null : "CONFIRMAR",
    });
    if (error) throw mapTrustError(error);
    const request = mapAccountLifecycleRow(rowFromRpc<AccountLifecycleRow>(data));
    if (input.kind !== "export") return request;

    const exportResult = await this.client.functions.invoke("account-export", {
      body: { requestId: request.id },
    });
    if (exportResult.error) throw mapTrustError(exportResult.error);
    const artifact = exportResult.data && typeof exportResult.data === "object"
      ? (exportResult.data as { artifact?: unknown }).artifact
      : null;
    if (!artifact || typeof artifact !== "object") {
      throw new TrustError("unknown", "O servidor não retornou o arquivo de exportação.");
    }
    const row = artifact as Record<string, unknown>;
    if (
      typeof row.requestId !== "string"
      || typeof row.downloadUrl !== "string"
      || typeof row.downloadUrlExpiresAt !== "string"
      || typeof row.artifactExpiresAt !== "string"
      || typeof row.byteSize !== "number"
      || typeof row.sha256 !== "string"
    ) {
      throw new TrustError("unknown", "O arquivo de exportação retornado é inválido.");
    }
    return {
      ...request,
      exportArtifact: {
        requestId: row.requestId,
        downloadUrl: row.downloadUrl,
        downloadUrlExpiresAt: row.downloadUrlExpiresAt,
        artifactExpiresAt: row.artifactExpiresAt,
        byteSize: row.byteSize,
        sha256: row.sha256,
      },
    };
  }

  async cancelAccountLifecycleRequest(requestId: string): Promise<AccountLifecycleRequest> {
    const { data, error } = await this.client.rpc("cancel_account_lifecycle", {
      p_request_id: requestId,
    });
    if (error) throw mapTrustError(error);
    return mapAccountLifecycleRow(rowFromRpc<AccountLifecycleRow>(data));
  }
}
