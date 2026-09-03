import type {
  ExploreInterest,
  ExplorePage,
  ExplorePageRequest,
  ExplorePost,
} from "./types";

export interface ExploreRepository {
  listInterests(request?: ExplorePageRequest): Promise<ExplorePage<ExploreInterest>>;
  listPublicPosts(request?: ExplorePageRequest): Promise<ExplorePage<ExplorePost>>;
}
