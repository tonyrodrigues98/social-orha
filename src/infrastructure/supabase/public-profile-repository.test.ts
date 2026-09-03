import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  createSupabasePublicProfileRepository,
  mapPublicProfileRow,
} from "./public-profile-repository";

function rpcResponse(data: unknown, error: unknown = null) {
  const promise = Promise.resolve({ data, error }) as Promise<{
    data: unknown;
    error: unknown;
  }> & { abortSignal: () => Promise<{ data: unknown; error: unknown }> };
  promise.abortSignal = () => promise;
  return promise;
}

const publicRow = {
  profile_id: "00000000-0000-4000-8000-000000000001",
  full_name: "Ana Clara",
  username: "ana.clara",
  bio: "Café e boas conversas.",
  church: null,
  avatar_path: null,
  state_code: null,
  city: null,
  age_years: 29,
  personality: ["acolhedora"],
  favorite_season: "outono",
  social_energy: "equilibrada",
  weekend_preferences: ["cinema"],
  visited_places: [],
  desired_places: ["Recife"],
  interests: ["filmes"],
  hobbies: ["leitura"],
  favorite_movies: [{ label: "Interestelar", externalId: "tmdb:157336" }],
  favorite_series: null,
  favorite_songs: [],
  favorite_artists: [],
  favorite_books: [],
  favorite_games: [],
  can_view_location: false,
  can_view_age: true,
  can_view_favorites: true,
  can_view_gallery: false,
  is_friend: true,
};

describe("Supabase public profile repository", () => {
  it("maps only fields already masked by the server", () => {
    const mapped = mapPublicProfileRow(publicRow);
    expect(mapped.stateCode).toBeNull();
    expect(mapped.city).toBeNull();
    expect(mapped.canViewLocation).toBe(false);
    expect(mapped.ageYears).toBe(29);
    expect(mapped.canViewAge).toBe(true);
    expect(mapped.favorites.movies).toEqual([
      { label: "Interestelar", externalId: "tmdb:157336", source: undefined, imageUrl: undefined },
    ]);
    expect(mapped.isFriend).toBe(true);
  });

  it("uses server search and selects the exact username", async () => {
    const rpc = vi.fn((name: string) => name === "search_visible_profiles"
      ? rpcResponse([
        { ...publicRow, profile_id: "other", username: "ana.clara2" },
        publicRow,
      ])
      : rpcResponse([{
        profile_id: publicRow.profile_id,
        age_years: 29,
        can_view_age: true,
      }]));
    const repository = createSupabasePublicProfileRepository({ rpc } as unknown as SupabaseClient);

    const loaded = await repository.findByUsername("ana.clara");

    expect(rpc).toHaveBeenCalledWith("search_visible_profiles", {
      search_term: "ana.clara",
      page_size: 10,
      page_offset: 0,
    });
    expect(rpc).toHaveBeenCalledWith("get_visible_profile_age", {
      p_profile_id: publicRow.profile_id,
    });
    expect(loaded?.id).toBe(publicRow.profile_id);
    expect(loaded?.ageYears).toBe(29);
  });

  it("keeps age hidden when the server denies disclosure", async () => {
    const rpc = vi.fn((name: string) => name === "search_visible_profiles"
      ? rpcResponse([publicRow])
      : rpcResponse([{
        profile_id: publicRow.profile_id,
        age_years: 29,
        can_view_age: false,
      }]));
    const repository = createSupabasePublicProfileRepository({ rpc } as unknown as SupabaseClient);

    const loaded = await repository.findByUsername("ana.clara");

    expect(loaded?.ageYears).toBeNull();
    expect(loaded?.canViewAge).toBe(false);
    expect(loaded).not.toHaveProperty("birthDate");
  });

  it("reads only the current viewer's blocked-profile RPC", async () => {
    const rpc = vi.fn(() => rpcResponse([{
      block_id: "00000000-0000-4000-8000-000000000002",
      blocked_profile_id: publicRow.profile_id,
      full_name: publicRow.full_name,
      username: publicRow.username,
      avatar_path: null,
    }]));
    const repository = createSupabasePublicProfileRepository({ rpc } as unknown as SupabaseClient);

    const blocked = await repository.findOwnBlockByUsername("ana.clara");

    expect(rpc).toHaveBeenCalledWith("get_own_blocked_profile_by_username", {
      p_username: "ana.clara",
    });
    expect(blocked?.profileId).toBe(publicRow.profile_id);
  });
});
