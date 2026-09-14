import type { AppRole } from "@/domain/identity";

export type GlobalRoleAssignment = {
  userId: string;
  fullName: string;
  username: string;
  role: AppRole;
  updatedAt: string;
};

export type GlobalRoleAssignmentPage = {
  items: GlobalRoleAssignment[];
  nextCursor: string | null;
};

export type GlobalRoleAssignmentRequest = {
  query?: string;
  cursor?: string | null;
  limit?: number;
  signal?: AbortSignal;
};

export type AssignGlobalRoleInput = {
  targetUserId: string;
  role: AppRole;
  reason: string;
};
