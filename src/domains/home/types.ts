export type HomePersonSummary = Readonly<{
  id: string;
  fullName: string | null;
  username: string | null;
}>;

export type HomePendingFriendRequest = Readonly<{
  id: string;
  createdAt: string;
  requester: HomePersonSummary;
}>;

export type HomePendingConversationRequest = Readonly<{
  id: string;
  createdAt: string;
  requester: HomePersonSummary;
}>;

export type HomeConversationSummary = Readonly<{
  id: string;
  kind: "direct" | "group";
  title: string;
  unreadCount: number;
  lastActivityAt: string;
}>;

export type HomeNotificationSummary = Readonly<{
  id: string;
  type: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
  readAt: string | null;
  actor: HomePersonSummary | null;
}>;

export type HomeCommunitySummary = Readonly<{
  id: string;
  name: string;
  category: string;
  lastActivityAt: string | null;
}>;

export type HomeCommunityActivity = Readonly<{
  postId: string;
  communityId: string;
  communityName: string;
  authorName: string | null;
  createdAt: string;
}>;

export const homeCompletionFields = [
  "fullName",
  "username",
  "birthDate",
  "state",
  "city",
  "bio",
  "personality",
  "favoriteSeason",
  "socialEnergy",
  "weekendPreferences",
  "interests",
  "hobbies",
  "visitedPlaces",
  "desiredPlaces",
  "favorites",
  "avatar",
  "cover",
  "gallery",
] as const;

export type HomeCompletionField = (typeof homeCompletionFields)[number];

export type HomeProfileCompletion = Readonly<{
  percentage: number;
  completedSignals: number;
  totalSignals: number;
  missing: HomeCompletionField[];
}>;

export type HomeDashboardSummary = Readonly<{
  pendingFriendRequests: Readonly<{
    count: number;
    items: HomePendingFriendRequest[];
  }>;
  pendingConversationRequests: Readonly<{
    count: number;
    items: HomePendingConversationRequest[];
  }>;
  recentConversations: HomeConversationSummary[];
  notifications: Readonly<{
    unreadCount: number;
    items: HomeNotificationSummary[];
  }>;
  communities: HomeCommunitySummary[];
  communityActivity: HomeCommunityActivity[];
  profileCompletion: HomeProfileCompletion;
}>;

export type HomeDashboardRequest = Readonly<{
  recentLimit?: number;
  signal?: AbortSignal;
}>;

export interface HomeDashboardRepository {
  getSummary(request?: HomeDashboardRequest): Promise<HomeDashboardSummary>;
}

export type HomeDashboardErrorKind =
  | "authentication"
  | "permission"
  | "network"
  | "invalid-response"
  | "unknown";

export class HomeDashboardError extends Error {
  constructor(
    readonly kind: HomeDashboardErrorKind,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "HomeDashboardError";
  }
}
