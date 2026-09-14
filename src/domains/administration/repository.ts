import type {
  AssignGlobalRoleInput,
  GlobalRoleAssignment,
  GlobalRoleAssignmentPage,
  GlobalRoleAssignmentRequest,
} from "./types";

export interface AdministrationRepository {
  listGlobalRoleAssignments(
    request?: GlobalRoleAssignmentRequest,
  ): Promise<GlobalRoleAssignmentPage>;
  assignGlobalRole(input: AssignGlobalRoleInput): Promise<GlobalRoleAssignment>;
}
