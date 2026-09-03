import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "../database.types";
import { createSupabaseExploreRepository } from "./explore-repository";

describe("Supabase Explore repository", () => {
  it("loads privacy-filtered interests with a stable offset cursor", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        { interest: "Cinema", profile_count: 8 },
        { interest: "Música", profile_count: 5 },
        { interest: "Livros", profile_count: 3 },
      ],
      error: null,
    });
    const repository = createSupabaseExploreRepository({ rpc } as unknown as SupabaseClient<Database>);

    await expect(repository.listInterests({ search: "  cine  ", limit: 2 })).resolves.toEqual({
      items: [
        { key: "cinema", label: "Cinema", profileCount: 8 },
        { key: "música", label: "Música", profileCount: 5 },
      ],
      nextCursor: "2",
    });
    expect(rpc).toHaveBeenCalledWith("search_discoverable_interests", {
      p_search: "cine",
      p_limit: 3,
      p_offset: 0,
    });
  });

  it("maps only complete public-post projections and continues pagination", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          post_id: "post-1",
          author_id: "profile-1",
          author_name: "Ana Clara",
          author_username: "anaclara",
          author_avatar_path: null,
          community_id: "community-1",
          community_name: "Cinema e fé",
          community_slug: "cinema-e-fe",
          body: "Filmes que aproximam pessoas.",
          created_at: "2026-08-16T10:00:00Z",
          media_count: 1,
          comment_count: 4,
          reaction_count: 7,
          viewer_reaction: "love",
        },
        {
          post_id: "post-2",
          author_id: "profile-2",
          author_name: "Lucas N.",
          author_username: "lucasn",
          body: "Uma segunda publicação.",
          created_at: "2026-08-16T09:00:00Z",
          media_count: 0,
          comment_count: 0,
          reaction_count: 0,
          viewer_reaction: null,
        },
      ],
      error: null,
    });
    const repository = createSupabaseExploreRepository({ rpc } as unknown as SupabaseClient<Database>);

    const page = await repository.listPublicPosts({ limit: 1, cursor: "2" });

    expect(page).toMatchObject({
      items: [{
        id: "post-1",
        authorName: "Ana Clara",
        communityName: "Cinema e fé",
        mediaCount: 1,
        commentCount: 4,
        reactionCount: 7,
        viewerReaction: "love",
      }],
      nextCursor: "3",
    });
    expect(rpc).toHaveBeenCalledWith("search_discoverable_posts", {
      p_search: "",
      p_limit: 2,
      p_offset: 2,
    });
  });

  it("rejects invalid cursors before calling the server", async () => {
    const rpc = vi.fn();
    const repository = createSupabaseExploreRepository({ rpc } as unknown as SupabaseClient<Database>);

    await expect(repository.listPublicPosts({ cursor: "not-a-cursor!" })).rejects.toMatchObject({
      kind: "validation",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps server authorization failures to a stable domain error", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "42501", message: "private database detail" },
    });
    const repository = createSupabaseExploreRepository({ rpc } as unknown as SupabaseClient<Database>);

    await expect(repository.listInterests()).rejects.toMatchObject({
      kind: "permission",
      message: "Seu perfil não pode acessar a descoberta agora.",
    });
  });
});
