import type { ProfileAccountStatus } from "@/domain/identity";

export type TrustProfileSummary = {
  id: string;
  fullName: string | null;
  username: string | null;
  avatarPath: string | null;
};

export type BlockedProfile = {
  id: string;
  blockedProfileId: string;
  blockedProfile: TrustProfileSummary | null;
  createdAt: string;
};

export type ReportTargetType =
  | "profile"
  | "community"
  | "community_post"
  | "post_comment"
  | "message";
export type ReportCategory =
  | "harassment"
  | "hate"
  | "sexual_content"
  | "violence"
  | "spam"
  | "impersonation"
  | "privacy"
  | "other";
export type ReportStatus = "open" | "in_review" | "resolved" | "dismissed";

export type CreateReportInput = {
  targetType: ReportTargetType;
  targetId: string;
  category: ReportCategory;
  details?: string | null;
};

export type Report = {
  id: string;
  reporterId: string;
  targetType: ReportTargetType;
  targetId: string;
  category: ReportCategory;
  details: string | null;
  status: ReportStatus;
  assignedTo: string | null;
  resolution: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
};

export type ModerationActionType =
  | "warn"
  | "hide_content"
  | "remove_content"
  | "restrict"
  | "suspend"
  | "ban"
  | "dismiss";

export type ApplyModerationActionInput = {
  reportId: string;
  actionType: ModerationActionType;
  reason: string;
  expiresAt?: string | null;
};

export type ModerationAction = {
  id: string;
  reportId: string;
  moderatorId: string;
  targetType: ReportTargetType;
  targetId: string;
  actionType: ModerationActionType;
  reason: string;
  expiresAt: string | null;
  createdAt: string;
};

export type ModerationReportContext = {
  reportId: string;
  targetType: ReportTargetType;
  targetId: string;
  targetOwnerId: string | null;
  contentText: string | null;
  contentKind: string | null;
  contentCreatedAt: string | null;
  attachmentIds: string[];
};

export type ModerationReportAttachment = {
  attachmentId: string;
  sourceKind: "message_attachment" | "post_media";
  mimeType: string;
  byteSize: number;
  durationSeconds: number | null;
  waveform: number[] | null;
  width: number | null;
  height: number | null;
  signedUrl: string;
  signedUrlExpiresInSeconds: number;
};

export type TrustPageRequest = {
  cursor?: string | null;
  limit?: number;
  signal?: AbortSignal;
};

export type TrustPage<T> = {
  items: T[];
  nextCursor: string | null;
};

export type ModerationQueueRequest = TrustPageRequest & {
  status?: ReportStatus | "all";
};

export type AccountSecuritySummary = {
  userId: string;
  email: string | null;
  emailConfirmed: boolean;
  lastSignInAt: string | null;
  sessionExpiresAt: string | null;
};

export type AccountAccessSummary = {
  effectiveStatus: ProfileAccountStatus;
  recordedStatus: ProfileAccountStatus;
  accessEnabled: boolean;
  publicReason: string | null;
  restrictedUntil: string | null;
};

export type AccountLifecycleKind = "export" | "deactivate" | "delete";
export type AccountLifecycleStatus =
  | "pending"
  | "processing"
  | "completed"
  | "cancelled"
  | "failed";

export type AccountLifecycleRequest = {
  id: string;
  profileId: string;
  kind: AccountLifecycleKind;
  status: AccountLifecycleStatus;
  requestedAt: string;
  scheduledFor: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  exportArtifact?: AccountExportArtifact | null;
};

export type AccountExportArtifact = {
  requestId: string;
  downloadUrl: string;
  downloadUrlExpiresAt: string;
  artifactExpiresAt: string;
  byteSize: number;
  sha256: string;
};

export type CreateAccountLifecycleRequestInput = {
  kind: AccountLifecycleKind;
  currentPassword?: string;
};

export type TrustCursor = { createdAt: string; id: string };

export function encodeTrustCursor(cursor: TrustCursor): string {
  return `${cursor.createdAt}|${cursor.id}`;
}

export function decodeTrustCursor(value: string): TrustCursor | null {
  const separator = value.lastIndexOf("|");
  if (separator <= 0) return null;
  const createdAt = value.slice(0, separator);
  const id = value.slice(separator + 1);
  const timestamp = Date.parse(createdAt);
  if (Number.isNaN(timestamp) || !uuidPattern.test(id)) return null;
  return { createdAt: new Date(timestamp).toISOString(), id };
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateCreateReport(input: CreateReportInput): CreateReportInput {
  if (!uuidPattern.test(input.targetId)) throw new Error("O alvo da denúncia é inválido.");
  const details = input.details?.trim() || null;
  if (details && details.length > 1500) {
    throw new Error("Os detalhes da denúncia devem ter no máximo 1.500 caracteres.");
  }
  return { ...input, details };
}

export function validateModerationAction(
  input: ApplyModerationActionInput,
): ApplyModerationActionInput {
  if (!uuidPattern.test(input.reportId)) throw new Error("A denúncia é inválida.");
  const reason = input.reason.trim();
  if (reason.length < 10) throw new Error("Informe um motivo com pelo menos 10 caracteres.");
  if (reason.length > 1000) throw new Error("O motivo deve ter no máximo 1.000 caracteres.");
  if (input.expiresAt && Number.isNaN(Date.parse(input.expiresAt))) {
    throw new Error("A data de encerramento da sanção é inválida.");
  }
  return { ...input, reason, expiresAt: input.expiresAt ?? null };
}
