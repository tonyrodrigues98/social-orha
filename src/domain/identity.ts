export type AppRole =
  | "super_admin"
  | "admin"
  | "moderator"
  | "support"
  | "user";

export type ProfileVisibility = "public" | "friends" | "private";

export type Profile = {
  id: string;
  full_name: string | null;
  username: string | null;
  birth_date: string | null;
  state_code: string | null;
  city: string | null;
  bio: string | null;
  church: string | null;
  avatar_path: string | null;
  onboarding_step: number;
  onboarding_completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProfileDetails = {
  profile_id: string;
  personality: string[];
  favorite_season: string | null;
  social_energy: string | null;
  weekend_preferences: string[];
  visited_places: string[];
  desired_places: string[];
  interests: string[];
  hobbies: string[];
  favorite_movies: unknown[];
  favorite_series: unknown[];
  favorite_songs: unknown[];
  favorite_artists: unknown[];
  favorite_books: unknown[];
  favorite_games: unknown[];
};

export type ProfilePrivacy = {
  profile_id: string;
  profile_visibility: ProfileVisibility;
  location_visibility: ProfileVisibility;
  favorites_visibility: ProfileVisibility;
  gallery_visibility: ProfileVisibility;
  dating_enabled: boolean;
};

export type UserIdentity = {
  profile: Profile;
  details: ProfileDetails;
  privacy: ProfilePrivacy;
  role: AppRole;
};

export const roleLabels: Record<AppRole, string> = {
  super_admin: "SuperAdmin",
  admin: "Admin",
  moderator: "Moderador",
  support: "Suporte",
  user: "Usuário",
};
