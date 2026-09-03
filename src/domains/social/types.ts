export type SocialPageRequest = {
  cursor?: string | null;
  limit?: number;
  search?: string;
  signal?: AbortSignal;
};

export type SocialPage<T> = {
  items: T[];
  nextCursor: string | null;
};

export type SocialProfile = {
  id: string;
  fullName: string;
  username: string;
  bio: string | null;
  church: string | null;
  avatarPath: string | null;
  stateCode: string | null;
  city: string | null;
  interests: string[];
  hobbies: string[];
  isFriend: boolean;
};

export type FriendshipStatus = "pending" | "accepted" | "declined";

export type Friendship = {
  id: string;
  requesterId: string;
  addresseeId: string;
  status: FriendshipStatus;
  acceptedAt: string | null;
  createdAt: string;
  updatedAt: string;
  requester: SocialProfile | null;
  addressee: SocialProfile | null;
};

export type FriendshipListRequest = SocialPageRequest & {
  status?: FriendshipStatus;
  direction?: "incoming" | "outgoing" | "either";
};

export type CommunityListRequest = SocialPageRequest & {
  category?: string;
};

export type Community = {
  id: string;
  ownerId: string | null;
  slug: string;
  name: string;
  description: string | null;
  category: string;
  visibility: CommunityVisibility;
  avatarPath: string | null;
  coverPath: string | null;
  memberCount: number;
  postCount: number;
  createdAt: string | null;
  updatedAt: string | null;
  archivedAt: string | null;
  viewerMembership: CommunityMembership | null;
};

export type CommunityRole = "owner" | "moderator" | "member";
export type CommunityVisibility = "public" | "private";
export type CommunityMembershipStatus = "pending" | "active" | "banned" | "left";

export type CommunityMembership = {
  communityId: string;
  profileId: string;
  role: CommunityRole;
  status: CommunityMembershipStatus;
  joinedAt: string | null;
  createdAt: string;
  updatedAt: string;
  profile: SocialProfile | null;
};

export type CommunityRule = {
  id: string;
  communityId: string;
  title: string;
  description: string;
  sortOrder: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MembershipListRequest = SocialPageRequest & {
  communityId?: string;
  profileId?: string;
};

export type CommunityPost = {
  id: string;
  communityId: string | null;
  authorId: string | null;
  body: string;
  visibility: ContentVisibility;
  status: ContentStatus;
  createdAt: string;
  updatedAt: string;
  commentCount: number;
  reactionCount: number;
  viewerReaction: ReactionKind | null;
  author: SocialProfile | null;
};

export type PostListRequest = SocialPageRequest & {
  communityId?: string;
  authorId?: string;
};

export type PostComment = {
  id: string;
  postId: string;
  authorId: string | null;
  parentCommentId: string | null;
  body: string;
  status: ContentStatus;
  createdAt: string;
  updatedAt: string;
  reactionCount: number;
  viewerReaction: ReactionKind | null;
  author: SocialProfile | null;
};

export type ReactionTarget = "post" | "comment";
export type ReactionKind = "like" | "love" | "amen" | "pray" | "support";
export type ContentVisibility = "public" | "friends" | "community" | "private";
export type ContentStatus = "active" | "hidden" | "removed";

export type SocialReaction = {
  id: string;
  targetType: ReactionTarget;
  targetId: string;
  profileId: string;
  kind: ReactionKind;
  createdAt: string;
};

export type CreateCommunityInput = {
  name: string;
  slug?: string;
  description?: string | null;
  visibility?: CommunityVisibility;
  category?: string;
};

export type CreatePostInput = {
  communityId?: string | null;
  body: string;
  visibility?: ContentVisibility;
};

export type CreateCommentInput = {
  postId: string;
  parentCommentId?: string | null;
  body: string;
};

export type SetReactionInput = {
  targetType: ReactionTarget;
  targetId: string;
  kind: ReactionKind | null;
};
