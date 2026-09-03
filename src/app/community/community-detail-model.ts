import type {
  Community,
  CommunityMembership,
} from "@/domains/social";
import { buildCommunityPath, isRouteUuid } from "../router-policy";

export type CommunityAccessState =
  | "owner"
  | "moderator"
  | "member"
  | "pending"
  | "banned"
  | "visitor";

export function buildCommunityDetailPath(communityId: string): string {
  return buildCommunityPath(communityId);
}

export function buildCommunityReportPath(communityId: string): string {
  if (!isRouteUuid(communityId)) throw new Error("Comunidade inválida.");
  return `/denunciar/community/${encodeURIComponent(communityId)}`;
}

export function buildCommunityPostReportPath(postId: string): string {
  if (!isRouteUuid(postId)) throw new Error("Publicação inválida.");
  return `/denunciar/community_post/${encodeURIComponent(postId)}`;
}

export function resolveCommunityAccessState(
  membership: CommunityMembership | null,
): CommunityAccessState {
  if (!membership) return "visitor";
  if (membership.status === "banned") return "banned";
  if (membership.status === "pending") return "pending";
  if (membership.status !== "active") return "visitor";
  if (membership.role === "owner") return "owner";
  if (membership.role === "moderator") return "moderator";
  return "member";
}

export function canPublishInCommunity(state: CommunityAccessState): boolean {
  return state === "owner" || state === "moderator" || state === "member";
}

export function communityMembershipActionLabel(
  community: Pick<Community, "visibility">,
  state: CommunityAccessState,
): string | null {
  if (state === "owner") return null;
  if (state === "banned") return "Participação indisponível";
  if (state === "pending") return "Cancelar solicitação";
  if (state === "moderator" || state === "member") return "Sair da comunidade";
  return community.visibility === "private" ? "Solicitar entrada" : "Entrar na comunidade";
}

export function communityCategoryLabel(category: string): string {
  if (!category || category === "general") return "Geral";
  return category
    .split("_")
    .filter(Boolean)
    .map((part) => `${part[0]?.toLocaleUpperCase("pt-BR") ?? ""}${part.slice(1)}`)
    .join(" ");
}
