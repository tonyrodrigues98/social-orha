import type { ReactionKind } from "@/domains/social";

export type ExplorePageRequest = {
  cursor?: string | null;
  limit?: number;
  search?: string;
  signal?: AbortSignal;
};

export type ExplorePage<T> = {
  items: T[];
  nextCursor: string | null;
};

export type ExploreInterest = {
  key: string;
  label: string;
  profileCount: number;
};

export type ExplorePost = {
  id: string;
  authorId: string;
  authorName: string;
  authorUsername: string;
  authorAvatarPath: string | null;
  communityId: string | null;
  communityName: string | null;
  communitySlug: string | null;
  body: string;
  createdAt: string;
  mediaCount: number;
  commentCount: number;
  reactionCount: number;
  viewerReaction: ReactionKind | null;
};
