import { describe, expect, it } from "vitest";
import type { CommunityMembership } from "@/domains/social";
import {
  buildCommunityDetailPath,
  canPublishInCommunity,
  communityCategoryLabel,
  communityMembershipActionLabel,
  resolveCommunityAccessState,
} from "./community-detail-model";

const membership: CommunityMembership = {
  communityId: "00000000-0000-4000-8000-000000000001",
  profileId: "00000000-0000-4000-8000-000000000002",
  role: "member",
  status: "active",
  joinedAt: "2026-08-16T12:00:00.000Z",
  createdAt: "2026-08-16T12:00:00.000Z",
  updatedAt: "2026-08-16T12:00:00.000Z",
  profile: null,
};

describe("community detail route contract", () => {
  it("builds only UUID community routes", () => {
    expect(buildCommunityDetailPath(membership.communityId)).toBe(
      `/comunidade/${membership.communityId}`,
    );
    expect(() => buildCommunityDetailPath("../admin")).toThrow("Comunidade inválida");
  });

  it("resolves server-owned membership roles and permissions", () => {
    expect(resolveCommunityAccessState(membership)).toBe("member");
    expect(resolveCommunityAccessState({ ...membership, role: "owner" })).toBe("owner");
    expect(resolveCommunityAccessState({ ...membership, status: "pending" })).toBe("pending");
    expect(resolveCommunityAccessState({ ...membership, status: "banned" })).toBe("banned");
    expect(canPublishInCommunity("moderator")).toBe(true);
    expect(canPublishInCommunity("visitor")).toBe(false);
  });

  it("describes public/private join behavior without granting authority", () => {
    expect(communityMembershipActionLabel({ visibility: "public" }, "visitor")).toBe("Entrar na comunidade");
    expect(communityMembershipActionLabel({ visibility: "private" }, "visitor")).toBe("Solicitar entrada");
    expect(communityMembershipActionLabel({ visibility: "private" }, "pending")).toBe("Cancelar solicitação");
    expect(communityMembershipActionLabel({ visibility: "public" }, "owner")).toBeNull();
  });

  it("presents stable category labels", () => {
    expect(communityCategoryLabel("general")).toBe("Geral");
    expect(communityCategoryLabel("fe_e_vida")).toBe("Fe E Vida");
  });
});
