import type {
  Community,
  CommunityMembership,
  CommunityPost,
  CommunityRule,
  Friendship,
  PostComment,
  SocialProfile,
  SocialReaction,
} from "@/domains/social";

export type SocialRow = Record<string, unknown>;

function requiredString(row: SocialRow, key: string): string {
  const value = row[key];
  if (typeof value !== "string" || !value) {
    throw new Error(`Resposta social inválida: ${key}.`);
  }
  return value;
}

function nullableString(row: SocialRow, key: string): string | null {
  const value = row[key];
  return typeof value === "string" && value ? value : null;
}

function finiteNumber(row: SocialRow, key: string): number {
  const value = row[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function stringArray(row: SocialRow, key: string): string[] {
  const value = row[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function nestedRow(row: SocialRow, key: string): SocialRow | null {
  const value = row[key];
  if (Array.isArray(value)) {
    const first = value[0];
    return first && typeof first === "object" ? (first as SocialRow) : null;
  }
  return value && typeof value === "object" ? (value as SocialRow) : null;
}

export function mapSocialProfile(row: SocialRow): SocialProfile {
  return {
    id: requiredString(row, row.profile_id ? "profile_id" : "id"),
    fullName: requiredString(row, "full_name"),
    username: requiredString(row, "username"),
    bio: nullableString(row, "bio"),
    church: nullableString(row, "church"),
    avatarPath: nullableString(row, "avatar_path"),
    stateCode: nullableString(row, "state_code"),
    city: nullableString(row, "city"),
    interests: stringArray(row, "interests"),
    hobbies: stringArray(row, "hobbies"),
    isFriend: row.is_friend === true,
  };
}

function mapOptionalProfile(row: SocialRow, key: string): SocialProfile | null {
  const profile = nestedRow(row, key);
  if (!profile) return null;
  try {
    return mapSocialProfile(profile);
  } catch {
    return null;
  }
}

export function mapFriendship(row: SocialRow): Friendship {
  return {
    id: requiredString(row, "id"),
    requesterId: requiredString(row, "requester_id"),
    addresseeId: requiredString(row, "addressee_id"),
    status: requiredString(row, "status") as Friendship["status"],
    acceptedAt: nullableString(row, "accepted_at"),
    createdAt: requiredString(row, "created_at"),
    updatedAt: requiredString(row, "updated_at"),
    requester: mapOptionalProfile(row, "requester"),
    addressee: mapOptionalProfile(row, "addressee"),
  };
}

export function mapCommunityMembership(row: SocialRow): CommunityMembership {
  return {
    communityId: requiredString(row, "community_id"),
    profileId: requiredString(row, "profile_id"),
    role: requiredString(row, "role") as CommunityMembership["role"],
    status: requiredString(row, "status") as CommunityMembership["status"],
    joinedAt: nullableString(row, "joined_at"),
    createdAt: requiredString(row, "created_at"),
    updatedAt: requiredString(row, "updated_at"),
    profile: mapOptionalProfile(row, "profile"),
  };
}

export function mapCommunityRule(row: SocialRow): CommunityRule {
  return {
    id: requiredString(row, "id"),
    communityId: requiredString(row, "community_id"),
    title: requiredString(row, "title"),
    description: requiredString(row, "description"),
    sortOrder: finiteNumber(row, "sort_order"),
    createdBy: nullableString(row, "created_by"),
    createdAt: requiredString(row, "created_at"),
    updatedAt: requiredString(row, "updated_at"),
  };
}

export function mapCommunity(row: SocialRow): Community {
  const viewerMembershipRow = nestedRow(row, "viewer_membership");
  return {
    id: requiredString(row, "id"),
    ownerId: nullableString(row, "owner_id"),
    slug: requiredString(row, "slug"),
    name: requiredString(row, "name"),
    description: nullableString(row, "description"),
    category: requiredString(row, "category"),
    visibility: requiredString(row, "visibility") as Community["visibility"],
    avatarPath: nullableString(row, "avatar_path"),
    coverPath: nullableString(row, "cover_path"),
    memberCount: finiteNumber(row, "member_count"),
    postCount: finiteNumber(row, "post_count"),
    createdAt: nullableString(row, "created_at"),
    updatedAt: nullableString(row, "updated_at"),
    archivedAt: nullableString(row, "archived_at"),
    viewerMembership: viewerMembershipRow
      ? mapCommunityMembership(viewerMembershipRow)
      : null,
  };
}

export function mapCommunityPost(row: SocialRow): CommunityPost {
  return {
    id: requiredString(row, "id"),
    communityId: nullableString(row, "community_id"),
    authorId: nullableString(row, "author_id"),
    body: requiredString(row, "body"),
    visibility: requiredString(row, "visibility") as CommunityPost["visibility"],
    status: requiredString(row, "status") as CommunityPost["status"],
    createdAt: requiredString(row, "created_at"),
    updatedAt: requiredString(row, "updated_at"),
    commentCount: finiteNumber(row, "comment_count"),
    reactionCount: finiteNumber(row, "reaction_count"),
    viewerReaction: nullableString(
      row,
      "viewer_reaction",
    ) as CommunityPost["viewerReaction"],
    author: mapOptionalProfile(row, "author"),
  };
}

export function mapPostComment(row: SocialRow): PostComment {
  return {
    id: requiredString(row, "id"),
    postId: requiredString(row, "post_id"),
    authorId: nullableString(row, "author_id"),
    parentCommentId: nullableString(row, "parent_comment_id"),
    body: requiredString(row, "body"),
    status: requiredString(row, "status") as PostComment["status"],
    createdAt: requiredString(row, "created_at"),
    updatedAt: requiredString(row, "updated_at"),
    reactionCount: finiteNumber(row, "reaction_count"),
    viewerReaction: nullableString(
      row,
      "viewer_reaction",
    ) as PostComment["viewerReaction"],
    author: mapOptionalProfile(row, "author"),
  };
}

export function mapSocialReaction(row: SocialRow): SocialReaction {
  const postId = nullableString(row, "post_id");
  return {
    id: requiredString(row, "id"),
    targetType: postId ? "post" : "comment",
    targetId: postId ?? requiredString(row, "comment_id"),
    profileId: requiredString(row, "reactor_id"),
    kind: requiredString(row, "kind") as SocialReaction["kind"],
    createdAt: requiredString(row, "created_at"),
  };
}
