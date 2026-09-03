import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { createSupabaseCommunityManagementRepository } from "./community-management-repository";

const userId = "00000000-0000-4000-8000-000000000001";
const communityId = "00000000-0000-4000-8000-000000000002";
const postId = "00000000-0000-4000-8000-000000000003";
const mediaId = "00000000-0000-4000-8000-000000000004";

function postMediaRow(status: "pending" | "ready", objectPath: string) {
  return {
    id: mediaId,
    post_id: postId,
    owner_id: userId,
    bucket_id: "community-media",
    object_path: objectPath,
    mime_type: "image/webp",
    byte_size: 32,
    width: 100,
    height: 80,
    sort_order: 0,
    status,
    created_at: "2026-08-16T18:00:00.000Z",
    updated_at: "2026-08-16T18:00:00.000Z",
  };
}

describe("community management Supabase repository", () => {
  it("uses server-authoritative RPCs for privileged removals and roles", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    const repository = createSupabaseCommunityManagementRepository({
      rpc,
    } as unknown as SupabaseClient);

    await repository.archiveCommunity(communityId);
    await repository.removePost(postId);
    await repository.removeComment(mediaId);
    await repository.setMemberRole(communityId, userId, "moderator");
    await repository.banMember(communityId, mediaId, "Spam recorrente");
    await repository.unbanMember(communityId, mediaId);

    expect(rpc).toHaveBeenNthCalledWith(1, "archive_community", {
      p_community_id: communityId,
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "remove_community_post", {
      p_post_id: postId,
    });
    expect(rpc).toHaveBeenNthCalledWith(3, "remove_post_comment", {
      p_comment_id: mediaId,
    });
    expect(rpc).toHaveBeenNthCalledWith(4, "set_community_member_role", {
      p_community_id: communityId,
      p_profile_id: userId,
      p_role: "moderator",
    });
    expect(rpc).toHaveBeenNthCalledWith(5, "ban_community_member", {
      p_community_id: communityId,
      p_profile_id: mediaId,
      p_reason: "Spam recorrente",
    });
    expect(rpc).toHaveBeenNthCalledWith(6, "unban_community_member", {
      p_community_id: communityId,
      p_profile_id: mediaId,
    });
  });

  it("reserves, uploads and delegates post media validation to the Edge Function", async () => {
    let reservedPath = "";
    const rpc = vi.fn(async (name: string, input: Record<string, unknown>) => {
      if (name === "reserve_post_media") {
        reservedPath = String(input.p_object_path);
        return { data: postMediaRow("pending", reservedPath), error: null };
      }
      return { data: null, error: null };
    });
    const upload = vi.fn(async () => ({ data: {}, error: null }));
    const createSignedUrl = vi.fn(async () => ({
      data: { signedUrl: "https://signed.example/post.webp" },
      error: null,
    }));
    const bucket = { upload, remove: vi.fn(), createSignedUrl };
    const invoke = vi.fn(async () => ({ data: { ok: true }, error: null }));
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      single: vi.fn(async () => ({ data: postMediaRow("ready", reservedPath), error: null })),
    };
    const client = {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: userId } }, error: null })) },
      rpc,
      storage: { from: vi.fn(() => bucket) },
      functions: { invoke },
      from: vi.fn(() => query),
    } as unknown as SupabaseClient;
    const repository = createSupabaseCommunityManagementRepository(client);
    const file = new File([new Uint8Array(32)], "post.webp", { type: "image/webp" });

    const uploaded = await repository.uploadPostMedia({
      postId,
      file,
      dimensions: { width: 100, height: 80 },
      sortOrder: 0,
    });

    expect(reservedPath).toMatch(new RegExp(`^${userId}/post/${postId}/[0-9a-f-]{36}\\.webp$`, "i"));
    expect(rpc).toHaveBeenCalledWith("reserve_post_media", {
      p_post_id: postId,
      p_object_path: reservedPath,
      p_mime_type: "image/webp",
      p_byte_size: 32,
      p_width: 100,
      p_height: 80,
      p_sort_order: 0,
    });
    expect(upload).toHaveBeenCalledWith(reservedPath, file, {
      cacheControl: "3600",
      contentType: "image/webp",
      upsert: false,
    });
    expect(invoke).toHaveBeenCalledWith("media-verify", {
      body: { scope: "post", mediaId },
    });
    expect(uploaded.readUrl).toBe("https://signed.example/post.webp");
  });

  it("uses the policy-compatible community branding path", async () => {
    const brandingMediaId = "00000000-0000-4000-8000-000000000005";
    let reservedPath = "";
    const rpc = vi.fn(async (name: string, input: Record<string, unknown>) => {
      if (name === "reserve_community_branding_media") {
        reservedPath = String(input.p_object_path);
        return {
          data: {
            id: brandingMediaId,
            community_id: communityId,
            owner_id: userId,
            purpose: "cover",
            bucket_id: "community-media",
            object_path: reservedPath,
            mime_type: "image/webp",
            byte_size: 32,
            width: 100,
            height: 80,
            status: "pending",
          },
          error: null,
        };
      }
      return { data: null, error: null };
    });
    const upload = vi.fn(async () => ({ data: {}, error: null }));
    const createSignedUrl = vi.fn(async () => ({
      data: { signedUrl: "https://signed.example/cover.webp" },
      error: null,
    }));
    const bucket = { upload, remove: vi.fn(async () => ({ error: null })), createSignedUrl };
    const invoke = vi.fn(async () => ({ data: { ok: true }, error: null }));
    const client = {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: userId } }, error: null })) },
      rpc,
      storage: { from: vi.fn(() => bucket) },
      functions: { invoke },
    } as unknown as SupabaseClient;
    const repository = createSupabaseCommunityManagementRepository(client);
    const file = new File([new Uint8Array(32)], "cover.webp", { type: "image/webp" });

    const result = await repository.uploadCommunityAsset({
      communityId,
      kind: "cover",
      file,
      dimensions: { width: 100, height: 80 },
      previousPath: null,
    });

    expect(result.objectPath).toMatch(new RegExp(`^${userId}/community/${communityId}/cover/[0-9a-f-]{36}\\.webp$`, "i"));
    expect(upload).toHaveBeenCalledWith(result.objectPath, file, {
      cacheControl: "3600",
      contentType: "image/webp",
      upsert: false,
    });
    expect(rpc).toHaveBeenCalledWith("reserve_community_branding_media", {
      p_community_id: communityId,
      p_purpose: "cover",
      p_object_path: result.objectPath,
      p_mime_type: "image/webp",
      p_byte_size: 32,
      p_width: 100,
      p_height: 80,
    });
    expect(invoke).toHaveBeenCalledWith("media-verify", {
      body: { scope: "community_branding", mediaId: brandingMediaId },
    });
  });
});
