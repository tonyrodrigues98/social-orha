import { describe, expect, it, vi } from "vitest";
import {
  mapHomeDashboardSummary,
  SupabaseHomeDashboardRepository,
  type HomeDashboardRpcClient,
} from "./home-dashboard-repository";

const ids = {
  friendRequest: "10000000-0000-4000-8000-000000000001",
  conversationRequest: "10000000-0000-4000-8000-000000000002",
  person: "10000000-0000-4000-8000-000000000003",
  conversation: "10000000-0000-4000-8000-000000000004",
  notification: "10000000-0000-4000-8000-000000000005",
  community: "10000000-0000-4000-8000-000000000006",
  post: "10000000-0000-4000-8000-000000000007",
};

const person = {
  id: ids.person,
  fullName: "Ana Clara",
  username: "anaclara",
};

const validSummary = {
  pendingFriendRequests: {
    count: 1,
    items: [{ id: ids.friendRequest, createdAt: "2026-08-16T12:00:00Z", requester: person }],
  },
  pendingConversationRequests: {
    count: 1,
    items: [{ id: ids.conversationRequest, createdAt: "2026-08-16T12:05:00Z", requester: person }],
  },
  recentConversations: [{
    id: ids.conversation,
    kind: "direct",
    title: "Ana Clara",
    unreadCount: 2,
    lastActivityAt: "2026-08-16T12:10:00Z",
  }],
  notifications: {
    unreadCount: 1,
    items: [{
      id: ids.notification,
      type: "friendship_request",
      entityType: "profile",
      entityId: ids.person,
      createdAt: "2026-08-16T12:00:00Z",
      readAt: null,
      actor: person,
    }],
  },
  communities: [{
    id: ids.community,
    name: "Cinema e fé",
    category: "cinema",
    lastActivityAt: "2026-08-16T11:00:00Z",
  }],
  communityActivity: [{
    postId: ids.post,
    communityId: ids.community,
    communityName: "Cinema e fé",
    authorName: "Ana Clara",
    createdAt: "2026-08-16T11:00:00Z",
  }],
  profileCompletion: {
    percentage: 89,
    completedSignals: 16,
    totalSignals: 18,
    missing: ["cover", "gallery"],
  },
};

function clientWith(data: unknown, error: unknown = null) {
  const request = Promise.resolve({ data, error });
  const rpc = vi.fn().mockReturnValue(request);
  return { client: { rpc } as unknown as HomeDashboardRpcClient, rpc };
}

describe("SupabaseHomeDashboardRepository", () => {
  it("maps the bounded server summary and keeps private bodies out of the contract", async () => {
    const { client, rpc } = clientWith(validSummary);
    const repository = new SupabaseHomeDashboardRepository(client);

    await expect(repository.getSummary({ recentLimit: 50 })).resolves.toEqual(validSummary);
    expect(rpc).toHaveBeenCalledWith("get_home_dashboard_summary", { p_recent_limit: 10 });
    expect(JSON.stringify(await repository.getSummary())).not.toMatch(/openingMessage|body|payload|birthDateValue/);
  });

  it("forwards AbortSignal when the PostgREST builder supports cancellation", async () => {
    const abortSignal = vi.fn();
    const request = Object.assign(Promise.resolve({ data: validSummary, error: null }), {
      abortSignal,
    });
    abortSignal.mockReturnValue(request);
    const client = {
      rpc: vi.fn().mockReturnValue(request),
    } as unknown as HomeDashboardRpcClient;
    const controller = new AbortController();

    await new SupabaseHomeDashboardRepository(client).getSummary({ signal: controller.signal });
    expect(abortSignal).toHaveBeenCalledWith(controller.signal);
  });

  it("rejects malformed or internally inconsistent payloads", () => {
    expect(() => mapHomeDashboardSummary({
      ...validSummary,
      pendingFriendRequests: { count: 0, items: validSummary.pendingFriendRequests.items },
    })).toThrow("dados inválidos");
    expect(() => mapHomeDashboardSummary({
      ...validSummary,
      profileCompletion: { ...validSummary.profileCompletion, percentage: 101 },
    })).toThrow("dados inválidos");
    expect(() => mapHomeDashboardSummary({
      ...validSummary,
      recentConversations: [{ ...validSummary.recentConversations[0], body: "segredo" }],
    })).toThrow("dados inválidos");
  });

  it("maps authorization and provider details to stable user-facing errors", async () => {
    const permission = clientWith(null, { code: "42501", message: "private database detail" });
    await expect(new SupabaseHomeDashboardRepository(permission.client).getSummary())
      .rejects.toMatchObject({ kind: "permission" });

    const networkClient = {
      rpc: vi.fn().mockReturnValue(Promise.reject(new TypeError("fetch failed"))),
    } as unknown as HomeDashboardRpcClient;
    await expect(new SupabaseHomeDashboardRepository(networkClient).getSummary())
      .rejects.toMatchObject({ kind: "network" });
  });
});
