import { describe, expect, it } from "vitest";
import {
  buildPublicProfilePath,
  buildPublicProfileReportPath,
  normalizePublicProfileUsername,
  publicProfileAgeLabel,
  resolvePublicProfileViewState,
  type OwnBlockedPublicProfile,
  type PublicProfile,
} from "./public-profile";

const profile: PublicProfile = {
  id: "00000000-0000-4000-8000-000000000001",
  fullName: "Ana Clara",
  username: "ana.clara",
  bio: null,
  church: null,
  avatarPath: null,
  stateCode: null,
  city: null,
  ageYears: null,
  personality: [],
  favoriteSeason: null,
  socialEnergy: null,
  weekendPreferences: [],
  visitedPlaces: [],
  desiredPlaces: [],
  interests: [],
  hobbies: [],
  favorites: {
    movies: [],
    series: [],
    songs: [],
    artists: [],
    books: [],
    games: [],
  },
  canViewLocation: false,
  canViewAge: false,
  canViewFavorites: false,
  canViewGallery: false,
  isFriend: false,
};

const ownBlock: OwnBlockedPublicProfile = {
  blockId: "00000000-0000-4000-8000-000000000002",
  profileId: profile.id,
  fullName: profile.fullName,
  username: profile.username,
  avatarPath: null,
};

describe("public profile route contract", () => {
  it("normalizes route usernames without accepting malformed paths", () => {
    expect(normalizePublicProfileUsername("%40Ana.Clara")).toBe("ana.clara");
    expect(normalizePublicProfileUsername("@lucas_98")).toBe("lucas_98");
    expect(normalizePublicProfileUsername("%E0%A4%A")).toBeNull();
    expect(normalizePublicProfileUsername("../admin")).toBeNull();
  });

  it("builds only app-owned profile and report paths", () => {
    expect(buildPublicProfilePath("@Ana.Clara")).toBe("/perfil/ana.clara");
    expect(buildPublicProfileReportPath(profile.id)).toBe(
      `/denunciar/profile/${profile.id}`,
    );
    expect(() => buildPublicProfilePath("//external.example")).toThrow("Username inválido");
  });

  it("formats only an age explicitly released by the server", () => {
    expect(publicProfileAgeLabel({ ageYears: 29, canViewAge: true })).toBe("29 anos");
    expect(publicProfileAgeLabel({ ageYears: 29, canViewAge: false })).toBeNull();
    expect(publicProfileAgeLabel({ ageYears: null, canViewAge: true })).toBeNull();
  });

  it("resolves own, friendship and pending request states", () => {
    expect(resolvePublicProfileViewState({
      viewerId: profile.id,
      profile,
      blocked: null,
      friendship: null,
    })).toBe("own");
    expect(resolvePublicProfileViewState({
      viewerId: "viewer",
      profile,
      blocked: null,
      friendship: {
        requesterId: "viewer",
        addresseeId: profile.id,
        status: "accepted",
      },
    })).toBe("friend");
    expect(resolvePublicProfileViewState({
      viewerId: "viewer",
      profile,
      blocked: null,
      friendship: {
        requesterId: profile.id,
        addresseeId: "viewer",
        status: "pending",
      },
    })).toBe("pending_incoming");
    expect(resolvePublicProfileViewState({
      viewerId: "viewer",
      profile,
      blocked: null,
      friendship: {
        requesterId: "viewer",
        addresseeId: profile.id,
        status: "pending",
      },
    })).toBe("pending_outgoing");
  });

  it("shows only the viewer's own block and otherwise keeps absence ambiguous", () => {
    expect(resolvePublicProfileViewState({
      viewerId: "viewer",
      profile: null,
      blocked: ownBlock,
      friendship: null,
    })).toBe("blocked_by_viewer");
    expect(resolvePublicProfileViewState({
      viewerId: "viewer",
      profile: null,
      blocked: null,
      friendship: null,
    })).toBe("private_or_unavailable");
  });
});
