import type {
  AccountAccessSummary,
  AccountSecuritySummary,
  AccountLifecycleRequest,
  ApplyModerationActionInput,
  BlockedProfile,
  CreateReportInput,
  CreateAccountLifecycleRequestInput,
  ModerationAction,
  ModerationReportAttachment,
  ModerationReportContext,
  ModerationQueueRequest,
  Report,
  TrustPage,
  TrustPageRequest,
} from "./types";

export interface TrustRepository {
  listBlockedProfiles(request?: TrustPageRequest): Promise<TrustPage<BlockedProfile>>;
  getBlockedProfile(profileId: string): Promise<BlockedProfile | null>;
  blockProfile(profileId: string, reason?: string | null): Promise<BlockedProfile>;
  unblockProfile(profileId: string): Promise<void>;

  createReport(input: CreateReportInput): Promise<Report>;
  listOwnReports(request?: TrustPageRequest): Promise<TrustPage<Report>>;
  listModerationQueue(request?: ModerationQueueRequest): Promise<TrustPage<Report>>;
  getModerationReportContext(reportId: string): Promise<ModerationReportContext>;
  getModerationReportAttachment(
    reportId: string,
    attachmentId: string,
  ): Promise<ModerationReportAttachment>;
  applyModerationAction(input: ApplyModerationActionInput): Promise<ModerationAction>;

  getAccountSecurity(): Promise<AccountSecuritySummary>;
  getAccountAccess(): Promise<AccountAccessSummary>;
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
  signOutEverywhere(): Promise<void>;
  listAccountLifecycleRequests(): Promise<AccountLifecycleRequest[]>;
  createAccountLifecycleRequest(
    input: CreateAccountLifecycleRequestInput,
  ): Promise<AccountLifecycleRequest>;
  cancelAccountLifecycleRequest(requestId: string): Promise<AccountLifecycleRequest>;
}
