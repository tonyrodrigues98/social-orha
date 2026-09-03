import type { FavoriteCategory, FavoriteItem } from "./profile-data";

export type PublicProfile = {
  id: string;
  fullName: string;
  username: string;
  bio: string | null;
  church: string | null;
  avatarPath: string | null;
  stateCode: string | null;
  city: string | null;
  /** Age is calculated and privacy-filtered by the database; birth date is never public. */
  ageYears: number | null;
  personality: string[];
  favoriteSeason: string | null;
  socialEnergy: string | null;
  weekendPreferences: string[];
  visitedPlaces: string[];
  desiredPlaces: string[];
  interests: string[];
  hobbies: string[];
  favorites: Record<FavoriteCategory, FavoriteItem[]>;
  canViewLocation: boolean;
  canViewAge: boolean;
  canViewFavorites: boolean;
  canViewGallery: boolean;
  isFriend: boolean;
};

export type OwnBlockedPublicProfile = {
  blockId: string;
  profileId: string;
  fullName: string | null;
  username: string;
  avatarPath: string | null;
};

export type PublicProfileViewState =
  | "own"
  | "friend"
  | "public"
  | "pending_incoming"
  | "pending_outgoing"
  | "blocked_by_viewer"
  | "private_or_unavailable";

export function normalizePublicProfileUsername(value: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  const normalized = decoded.normalize("NFKC").trim().replace(/^@/, "").toLocaleLowerCase("pt-BR");
  return /^[a-z0-9._]{3,30}$/.test(normalized) ? normalized : null;
}

export function buildPublicProfilePath(username: string): string {
  const normalized = normalizePublicProfileUsername(username);
  if (!normalized) throw new Error("Username inválido.");
  return `/perfil/${encodeURIComponent(normalized)}`;
}

export function buildPublicProfileReportPath(profileId: string): string {
  return `/denunciar/profile/${encodeURIComponent(profileId)}`;
}

export function publicProfileAgeLabel(profile: Pick<PublicProfile, "ageYears" | "canViewAge">): string | null {
  return profile.canViewAge && profile.ageYears !== null
    ? `${profile.ageYears} anos`
    : null;
}

export function resolvePublicProfileViewState({
  viewerId,
  profile,
  blocked,
  friendship,
}: {
  viewerId: string;
  profile: PublicProfile | null;
  blocked: OwnBlockedPublicProfile | null;
  friendship: {
    requesterId: string;
    addresseeId: string;
    status: "pending" | "accepted" | "declined";
  } | null;
}): PublicProfileViewState {
  if (blocked) return "blocked_by_viewer";
  if (!profile) return "private_or_unavailable";
  if (profile.id === viewerId) return "own";
  if (friendship?.status === "accepted" || profile.isFriend) return "friend";
  if (friendship?.status === "pending") {
    return friendship.addresseeId === viewerId
      ? "pending_incoming"
      : "pending_outgoing";
  }
  return "public";
}
