import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { createSupabaseSocialRepository } from "./social-repository";

describe("Supabase social repository RPC contract", () => {
  it("does not hide a next profile page at the RPC maximum", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: Array.from({ length: 50 }, (_, index) => ({
        profile_id: `profile-${index}`,
        full_name: `Pessoa ${index}`,
        username: `pessoa${index}`,
        interests: [],
        hobbies: [],
        is_friend: false,
      })),
      error: null,
    });
    const repository = createSupabaseSocialRepository({
      rpc,
    } as unknown as SupabaseClient);

    await expect(repository.listProfiles({ limit: 50 })).resolves.toMatchObject({
      items: { length: 50 },
      nextCursor: "1e",
    });
    expect(rpc).toHaveBeenCalledWith("search_visible_profiles", {
      search_term: "",
      page_size: 50,
      page_offset: 0,
    });
  });

  it("normalizes the community slug before calling the final RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        id: "community-id",
        owner_id: "viewer-id",
        slug: "cafe-e-fe",
        name: "Café e Fé",
        description: "",
        category: "general",
        visibility: "public",
        avatar_path: null,
        cover_path: null,
        created_at: "2026-08-16T10:00:00Z",
        updated_at: "2026-08-16T10:00:00Z",
        archived_at: null,
      },
      error: null,
    });
    const repository = createSupabaseSocialRepository({ rpc } as unknown as SupabaseClient);

    await repository.createCommunity({ name: "Café e Fé" });

    expect(rpc).toHaveBeenCalledWith("create_community", {
      p_name: "Café e Fé",
      p_slug: "cafe-e-fe",
      p_description: "",
      p_visibility: "public",
      p_category: "general",
    });
  });

  it("counts only active community members and posts", async () => {
    const result = Promise.resolve({ data: [], error: null });
    const query = {
      select: vi.fn(),
      is: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      range: vi.fn(),
      then: result.then.bind(result),
    };
    for (const method of ["select", "is", "eq", "order", "range"] as const) {
      query[method].mockReturnValue(query);
    }
    const client = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "viewer-id" } },
          error: null,
        }),
      },
      from: vi.fn().mockReturnValue(query),
    };
    const repository = createSupabaseSocialRepository(
      client as unknown as SupabaseClient,
    );

    await expect(repository.listCommunities()).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
    expect(query.eq).toHaveBeenCalledWith(
      "community_memberships.status",
      "active",
    );
    expect(query.eq).toHaveBeenCalledWith("community_posts.status", "active");
  });

  it("uses the same active counters when loading one community", async () => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      is: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    for (const method of ["select", "eq", "is"] as const) {
      query[method].mockReturnValue(query);
    }
    const repository = createSupabaseSocialRepository({
      from: vi.fn().mockReturnValue(query),
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    } as unknown as SupabaseClient);

    await expect(repository.getCommunity("community-id")).resolves.toBeNull();
    expect(query.eq).toHaveBeenCalledWith(
      "community_memberships.status",
      "active",
    );
    expect(query.eq).toHaveBeenCalledWith("community_posts.status", "active");
  });

  it("uses discovery metadata when a private community row is not directly visible", async () => {
    const rawQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      is: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const membershipQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    for (const query of [rawQuery, membershipQuery]) {
      for (const method of ["select", "eq"] as const) {
        query[method].mockReturnValue(query);
      }
    }
    rawQuery.is.mockReturnValue(rawQuery);
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        community_id: "private-community",
        slug: "grupo-privado",
        name: "Grupo privado",
        description: "Visível por descoberta segura.",
        category: "estudos",
        avatar_path: null,
        cover_path: null,
        visibility: "private",
        active_member_count: 7,
        active_post_count: 3,
      }],
      error: null,
    });
    const from = vi
      .fn()
      .mockReturnValueOnce(rawQuery)
      .mockReturnValueOnce(membershipQuery);
    const repository = createSupabaseSocialRepository({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "viewer-id" } },
          error: null,
        }),
      },
      from,
      rpc,
    } as unknown as SupabaseClient);

    await expect(repository.getCommunity("private-community")).resolves.toMatchObject({
      id: "private-community",
      name: "Grupo privado",
      category: "estudos",
      memberCount: 7,
      postCount: 3,
      createdAt: null,
    });
    expect(rpc).toHaveBeenCalledWith("get_community_discovery", {
      p_community_id: "private-community",
    });
  });

  it("uses the final membership moderation RPC contract", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        community_id: "community-id",
        profile_id: "profile-id",
        role: "member",
        status: "active",
        joined_at: "2026-08-16T10:00:00Z",
        created_at: "2026-08-16T09:00:00Z",
        updated_at: "2026-08-16T10:00:00Z",
      },
      error: null,
    });
    const repository = createSupabaseSocialRepository({
      rpc,
    } as unknown as SupabaseClient);

    await expect(
      repository.respondToCommunityMembership(
        "community-id",
        "profile-id",
        true,
      ),
    ).resolves.toMatchObject({ status: "active" });
    expect(rpc).toHaveBeenCalledWith("respond_to_community_membership", {
      p_community_id: "community-id",
      p_profile_id: "profile-id",
      p_accept: true,
    });
  });

  it("loads one visible publication by its trusted RPC and verifies the community", async () => {
    const communityId = "10000000-0000-4000-8000-000000000001";
    const postId = "10000000-0000-4000-8000-000000000002";
    const signal = new AbortController().signal;
    const result = Promise.resolve({
      data: [{
        post_id: postId,
        community_id: communityId,
        author_id: "10000000-0000-4000-8000-000000000003",
        body: "Uma conversa real.",
        visibility: "community",
        status: "active",
        created_at: "2026-08-16T10:00:00Z",
        updated_at: "2026-08-16T10:00:00Z",
        comment_count: 2,
        reaction_count: 3,
        viewer_reaction: "amen",
        author_full_name: "Ana Clara",
        author_username: "ana.clara",
        author_avatar_path: null,
      }],
      error: null,
    });
    const request = {
      abortSignal: vi.fn(),
      then: result.then.bind(result),
    };
    request.abortSignal.mockReturnValue(request);
    const rpc = vi.fn().mockReturnValue(request);
    const repository = createSupabaseSocialRepository({ rpc } as unknown as SupabaseClient);

    await expect(repository.getPost(communityId, postId, signal)).resolves.toMatchObject({
      id: postId,
      communityId,
      author: { fullName: "Ana Clara", username: "ana.clara" },
      commentCount: 2,
      reactionCount: 3,
      viewerReaction: "amen",
    });
    expect(rpc).toHaveBeenCalledWith("get_visible_community_post", {
      p_post_id: postId,
    });
    expect(request.abortSignal).toHaveBeenCalledWith(signal);
  });

  it("does not open a publication under a mismatched community route", async () => {
    const repository = createSupabaseSocialRepository({
      rpc: vi.fn().mockResolvedValue({
        data: [{
          post_id: "10000000-0000-4000-8000-000000000002",
          community_id: "10000000-0000-4000-8000-000000000099",
        }],
        error: null,
      }),
    } as unknown as SupabaseClient);

    await expect(repository.getPost(
      "10000000-0000-4000-8000-000000000001",
      "10000000-0000-4000-8000-000000000002",
    )).resolves.toBeNull();
  });
});
