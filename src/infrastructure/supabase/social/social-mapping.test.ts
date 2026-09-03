import { describe, expect, it } from "vitest";
import {
  mapCommunity,
  mapCommunityMembership,
  mapCommunityRule,
} from "./mappers";
import {
  createSocialPage,
  decodeSocialCursor,
  normalizeSocialPageLimit,
} from "./pagination";
import { toCommunitySlug } from "./social-repository";

describe("Supabase social pagination", () => {
  it("caps page sizes and rejects malformed cursors", () => {
    expect(normalizeSocialPageLimit(500)).toBe(50);
    expect(normalizeSocialPageLimit(0)).toBe(1);
    expect(decodeSocialCursor("not-a-cursor")).toBe(0);
  });

  it("uses the extra fetched row only to produce the next cursor", () => {
    expect(createSocialPage(["a", "b", "c"], 0, 2, (item) => item)).toEqual({
      items: ["a", "b"],
      nextCursor: "2",
    });
  });

  it("continues a full page when the upstream RPC cannot return a sentinel", () => {
    expect(
      createSocialPage(["a", "b"], 0, 2, (item) => item, true),
    ).toEqual({
      items: ["a", "b"],
      nextCursor: "2",
    });
  });
});

describe("community input mapping", () => {
  it("creates the server slug from the supplied name without changing its content", () => {
    expect(toCommunitySlug("Café, Fé e Conversa")).toBe("cafe-fe-e-conversa");
  });
});

describe("Supabase social mappers", () => {
  it("maps server-owned counters and membership without inventing content", () => {
    expect(
      mapCommunity({
        id: "community-id",
        owner_id: "owner-id",
        slug: "comunidade-real",
        name: "Comunidade real",
        description: "",
        category: "general",
        visibility: "public",
        avatar_path: null,
        cover_path: null,
        member_count: 3,
        post_count: 2,
        created_at: "2026-08-16T10:00:00Z",
        updated_at: "2026-08-16T10:00:00Z",
        archived_at: null,
        viewer_membership: {
          community_id: "community-id",
          profile_id: "profile-id",
          role: "member",
          status: "active",
          joined_at: "2026-08-16T10:00:00Z",
          created_at: "2026-08-16T10:00:00Z",
          updated_at: "2026-08-16T10:00:00Z",
        },
      }),
    ).toMatchObject({
      id: "community-id",
      memberCount: 3,
      postCount: 2,
      category: "general",
      viewerMembership: { profileId: "profile-id", status: "active" },
    });
  });

  it("keeps a visible member profile attached to its membership", () => {
    expect(
      mapCommunityMembership({
        community_id: "community-id",
        profile_id: "profile-id",
        role: "member",
        status: "active",
        joined_at: "2026-08-16T10:00:00Z",
        created_at: "2026-08-16T10:00:00Z",
        updated_at: "2026-08-16T10:00:00Z",
        profile: {
          profile_id: "profile-id",
          full_name: "Pessoa visível",
          username: "pessoa",
          interests: [],
          hobbies: [],
          is_friend: false,
        },
      }),
    ).toMatchObject({
      profileId: "profile-id",
      profile: { id: "profile-id", fullName: "Pessoa visível" },
    });
  });

  it("maps community rules in their server-defined order", () => {
    expect(
      mapCommunityRule({
        id: "rule-id",
        community_id: "community-id",
        title: "Respeito",
        description: "Converse com respeito.",
        sort_order: 2,
        created_by: "owner-id",
        created_at: "2026-08-16T10:00:00Z",
        updated_at: "2026-08-16T10:00:00Z",
      }),
    ).toMatchObject({
      id: "rule-id",
      communityId: "community-id",
      sortOrder: 2,
    });
  });
});
