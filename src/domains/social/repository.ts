import type {
  Community,
  CommunityListRequest,
  CommunityMembership,
  CommunityPost,
  CommunityRule,
  CreateCommentInput,
  CreateCommunityInput,
  CreatePostInput,
  Friendship,
  FriendshipListRequest,
  MembershipListRequest,
  PostComment,
  PostListRequest,
  SetReactionInput,
  SocialPage,
  SocialPageRequest,
  SocialProfile,
  SocialReaction,
} from "./types";

export interface SocialRepository {
  listProfiles(request?: SocialPageRequest): Promise<SocialPage<SocialProfile>>;
  getProfile(profileId: string, signal?: AbortSignal): Promise<SocialProfile | null>;

  listFriendships(request?: FriendshipListRequest): Promise<SocialPage<Friendship>>;
  getFriendshipWith(profileId: string, signal?: AbortSignal): Promise<Friendship | null>;
  requestFriendship(profileId: string): Promise<Friendship>;
  respondToFriendship(friendshipId: string, accept: boolean): Promise<Friendship>;
  removeFriendship(friendshipId: string): Promise<void>;

  listCommunities(request?: CommunityListRequest): Promise<SocialPage<Community>>;
  getCommunity(communityId: string, signal?: AbortSignal): Promise<Community | null>;
  createCommunity(input: CreateCommunityInput): Promise<Community>;

  listMemberships(request?: MembershipListRequest): Promise<SocialPage<CommunityMembership>>;
  joinCommunity(communityId: string): Promise<CommunityMembership>;
  leaveCommunity(communityId: string): Promise<void>;
  respondToCommunityMembership(
    communityId: string,
    profileId: string,
    accept: boolean,
  ): Promise<CommunityMembership>;
  listCommunityRules(
    communityId: string,
    request?: SocialPageRequest,
  ): Promise<SocialPage<CommunityRule>>;

  listPosts(request?: PostListRequest): Promise<SocialPage<CommunityPost>>;
  getPost(
    communityId: string,
    postId: string,
    signal?: AbortSignal,
  ): Promise<CommunityPost | null>;
  createPost(input: CreatePostInput): Promise<CommunityPost>;

  listComments(postId: string, request?: SocialPageRequest): Promise<SocialPage<PostComment>>;
  createComment(input: CreateCommentInput): Promise<PostComment>;

  setReaction(input: SetReactionInput): Promise<SocialReaction | null>;

}
