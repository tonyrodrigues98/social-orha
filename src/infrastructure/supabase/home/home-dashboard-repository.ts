import {
  HomeDashboardError,
  homeCompletionFields,
  type HomeCommunityActivity,
  type HomeCommunitySummary,
  type HomeCompletionField,
  type HomeConversationSummary,
  type HomeDashboardRepository,
  type HomeDashboardRequest,
  type HomeDashboardSummary,
  type HomeNotificationSummary,
  type HomePendingConversationRequest,
  type HomePendingFriendRequest,
  type HomePersonSummary,
  type HomeProfileCompletion,
} from "@/domains/home/types";
import { getSupabaseClient } from "../client";

type RpcResult = { data: unknown; error: unknown };
type RpcRequest = PromiseLike<RpcResult> & {
  abortSignal?: (signal: AbortSignal) => RpcRequest;
};
export type HomeDashboardRpcClient = {
  rpc(
    name: "get_home_dashboard_summary",
    args: { p_recent_limit: number },
  ): RpcRequest;
};

type UnknownRecord = Record<string, unknown>;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const completionFieldSet = new Set<HomeCompletionField>(homeCompletionFields);

function invalidResponse(): never {
  throw new HomeDashboardError(
    "invalid-response",
    "O resumo da sua página inicial retornou dados inválidos.",
  );
}

function record(value: unknown): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalidResponse();
  return value as UnknownRecord;
}

function exactRecord(value: unknown, allowedKeys: readonly string[]): UnknownRecord {
  const item = record(value);
  const allowed = new Set(allowedKeys);
  if (Object.keys(item).some((key) => !allowed.has(key))) invalidResponse();
  return item;
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) invalidResponse();
  return value;
}

function boundedArray(value: unknown, maximum = 10): unknown[] {
  const items = array(value);
  if (items.length > maximum) invalidResponse();
  return items;
}

function requiredString(value: unknown, maximum = 200): string {
  if (typeof value !== "string") invalidResponse();
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) invalidResponse();
  return normalized;
}

function optionalString(value: unknown, maximum = 200): string | null {
  if (value === null || value === undefined) return null;
  return requiredString(value, maximum);
}

function uuid(value: unknown): string {
  const identifier = requiredString(value, 36);
  if (!uuidPattern.test(identifier)) invalidResponse();
  return identifier;
}

function isoDate(value: unknown): string {
  const candidate = requiredString(value, 40);
  if (Number.isNaN(Date.parse(candidate))) invalidResponse();
  return candidate;
}

function optionalIsoDate(value: unknown): string | null {
  return value === null || value === undefined ? null : isoDate(value);
}

function nonNegativeInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    invalidResponse();
  }
  return value;
}

function person(value: unknown): HomePersonSummary {
  const item = exactRecord(value, ["id", "fullName", "username"]);
  return {
    id: uuid(item.id),
    fullName: optionalString(item.fullName, 100),
    username: optionalString(item.username, 40),
  };
}

function pendingFriendRequest(value: unknown): HomePendingFriendRequest {
  const item = exactRecord(value, ["id", "createdAt", "requester"]);
  return {
    id: uuid(item.id),
    createdAt: isoDate(item.createdAt),
    requester: person(item.requester),
  };
}

function pendingConversationRequest(value: unknown): HomePendingConversationRequest {
  const item = exactRecord(value, ["id", "createdAt", "requester"]);
  return {
    id: uuid(item.id),
    createdAt: isoDate(item.createdAt),
    requester: person(item.requester),
  };
}

function conversation(value: unknown): HomeConversationSummary {
  const item = exactRecord(value, ["id", "kind", "title", "unreadCount", "lastActivityAt"]);
  const kind = item.kind;
  if (kind !== "direct" && kind !== "group") invalidResponse();
  return {
    id: uuid(item.id),
    kind,
    title: requiredString(item.title, 100),
    unreadCount: nonNegativeInteger(item.unreadCount),
    lastActivityAt: isoDate(item.lastActivityAt),
  };
}

function notification(value: unknown): HomeNotificationSummary {
  const item = exactRecord(value, [
    "id",
    "type",
    "entityType",
    "entityId",
    "createdAt",
    "readAt",
    "actor",
  ]);
  return {
    id: uuid(item.id),
    type: requiredString(item.type, 50),
    entityType: optionalString(item.entityType, 50),
    entityId: item.entityId === null || item.entityId === undefined
      ? null
      : uuid(item.entityId),
    createdAt: isoDate(item.createdAt),
    readAt: optionalIsoDate(item.readAt),
    actor: item.actor === null || item.actor === undefined ? null : person(item.actor),
  };
}

function community(value: unknown): HomeCommunitySummary {
  const item = exactRecord(value, ["id", "name", "category", "lastActivityAt"]);
  return {
    id: uuid(item.id),
    name: requiredString(item.name, 100),
    category: requiredString(item.category, 40),
    lastActivityAt: optionalIsoDate(item.lastActivityAt),
  };
}

function communityActivity(value: unknown): HomeCommunityActivity {
  const item = exactRecord(value, [
    "postId",
    "communityId",
    "communityName",
    "authorName",
    "createdAt",
  ]);
  return {
    postId: uuid(item.postId),
    communityId: uuid(item.communityId),
    communityName: requiredString(item.communityName, 100),
    authorName: optionalString(item.authorName, 100),
    createdAt: isoDate(item.createdAt),
  };
}

function profileCompletion(value: unknown): HomeProfileCompletion {
  const item = exactRecord(value, [
    "percentage",
    "completedSignals",
    "totalSignals",
    "missing",
  ]);
  const percentage = nonNegativeInteger(item.percentage);
  const completedSignals = nonNegativeInteger(item.completedSignals);
  const totalSignals = nonNegativeInteger(item.totalSignals);
  const missing = boundedArray(item.missing, homeCompletionFields.length).map((entry) => {
    const field = requiredString(entry, 20) as HomeCompletionField;
    if (!completionFieldSet.has(field)) invalidResponse();
    return field;
  });
  if (
    percentage > 100
    || percentage !== Math.round((completedSignals * 100) / Math.max(totalSignals, 1))
    || totalSignals !== homeCompletionFields.length
    || completedSignals > totalSignals
    || missing.length !== totalSignals - completedSignals
    || new Set(missing).size !== missing.length
  ) {
    invalidResponse();
  }
  return { percentage, completedSignals, totalSignals, missing };
}

export function mapHomeDashboardSummary(value: unknown): HomeDashboardSummary {
  const root = exactRecord(value, [
    "pendingFriendRequests",
    "pendingConversationRequests",
    "recentConversations",
    "notifications",
    "communities",
    "communityActivity",
    "profileCompletion",
  ]);
  const friendRequests = exactRecord(root.pendingFriendRequests, ["count", "items"]);
  const conversationRequests = exactRecord(root.pendingConversationRequests, ["count", "items"]);
  const notifications = exactRecord(root.notifications, ["unreadCount", "items"]);
  const pendingFriendItems = boundedArray(friendRequests.items).map(pendingFriendRequest);
  const pendingConversationItems = boundedArray(conversationRequests.items).map(pendingConversationRequest);
  const friendCount = nonNegativeInteger(friendRequests.count);
  const conversationCount = nonNegativeInteger(conversationRequests.count);
  const unreadCount = nonNegativeInteger(notifications.unreadCount);
  if (friendCount < pendingFriendItems.length || conversationCount < pendingConversationItems.length) {
    invalidResponse();
  }
  return {
    pendingFriendRequests: { count: friendCount, items: pendingFriendItems },
    pendingConversationRequests: { count: conversationCount, items: pendingConversationItems },
    recentConversations: boundedArray(root.recentConversations).map(conversation),
    notifications: {
      unreadCount,
      items: boundedArray(notifications.items).map(notification),
    },
    communities: boundedArray(root.communities).map(community),
    communityActivity: boundedArray(root.communityActivity).map(communityActivity),
    profileCompletion: profileCompletion(root.profileCompletion),
  };
}

function mapError(error: unknown): HomeDashboardError {
  if (error instanceof HomeDashboardError) return error;
  const source = (error ?? {}) as { code?: string; message?: string; status?: number };
  if (source.status === 401 || source.code === "PGRST301") {
    return new HomeDashboardError("authentication", "Sua sessão expirou. Entre novamente.", { cause: error });
  }
  if (source.status === 403 || source.code === "42501") {
    return new HomeDashboardError("permission", "Sua conta não pode abrir a página inicial agora.", { cause: error });
  }
  if (error instanceof TypeError || /fetch|network|offline/i.test(source.message ?? "")) {
    return new HomeDashboardError("network", "Sem conexão com o servidor. Verifique sua internet.", { cause: error });
  }
  return new HomeDashboardError("unknown", "Não foi possível carregar sua página inicial agora.", { cause: error });
}

function recentLimit(value?: number): number {
  if (!Number.isFinite(value)) return 5;
  return Math.min(10, Math.max(1, Math.trunc(value ?? 5)));
}

export class SupabaseHomeDashboardRepository implements HomeDashboardRepository {
  constructor(private readonly client: HomeDashboardRpcClient) {}

  async getSummary(request: HomeDashboardRequest = {}): Promise<HomeDashboardSummary> {
    try {
      let query = this.client.rpc("get_home_dashboard_summary", {
        p_recent_limit: recentLimit(request.recentLimit),
      });
      if (request.signal && query.abortSignal) query = query.abortSignal(request.signal);
      const { data, error } = await query;
      if (error) throw error;
      return mapHomeDashboardSummary(data);
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") throw cause;
      throw mapError(cause);
    }
  }
}

let repository: HomeDashboardRepository | null = null;

export function getHomeDashboardRepository(): HomeDashboardRepository {
  repository ??= new SupabaseHomeDashboardRepository(
    getSupabaseClient() as unknown as HomeDashboardRpcClient,
  );
  return repository;
}
