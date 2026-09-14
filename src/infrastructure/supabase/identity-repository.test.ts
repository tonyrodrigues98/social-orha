import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createProfileDataRepository } from "./identity-repository";

function updateClient(data: unknown) {
  const builder = {
    update: vi.fn(),
    eq: vi.fn(),
    select: vi.fn(),
    single: vi.fn(async () => ({ data, error: null })),
  };
  builder.update.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.select.mockReturnValue(builder);
  const client = { from: vi.fn(() => builder) } as unknown as SupabaseClient;
  return { client, builder };
}

function selectClient(data: unknown) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    single: vi.fn(async () => ({ data, error: null })),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  const client = { from: vi.fn(() => builder) } as unknown as SupabaseClient;
  return { client, builder };
}

function identityClient(rows: Record<string, unknown>) {
  const builders = new Map<string, ReturnType<typeof selectClient>["builder"]>();
  const rpc = vi.fn().mockResolvedValue({
    data: [{
      effective_status: "active",
      recorded_status: "restricted",
      restricted_until: "2026-08-17T00:00:00Z",
      access_enabled: true,
    }],
    error: null,
  });
  const client = {
    from: vi.fn((table: string) => {
      const builder = selectClient(rows[table]).builder;
      builders.set(table, builder);
      return builder;
    }),
    rpc,
  } as unknown as SupabaseClient;
  return { client, builders, rpc };
}

describe("createProfileDataRepository", () => {
  it("carrega o estado de moderação definido pelo servidor junto da identidade", async () => {
    const moderationState = {
      profile_id: "user-1",
      status: "restricted",
      public_reason: "Revisão de segurança",
      restricted_until: "2026-08-17T00:00:00Z",
      created_at: "2026-08-16T00:00:00Z",
      updated_at: "2026-08-16T01:00:00Z",
    };
    const { client, builders, rpc } = identityClient({
      profiles: { id: "user-1" },
      profile_details: { profile_id: "user-1" },
      profile_privacy: { profile_id: "user-1" },
      profile_moderation_state: moderationState,
      user_roles: { role: "user" },
    });
    const repository = createProfileDataRepository(client);

    await expect(repository.loadIdentity("user-1")).resolves.toMatchObject({
      privacy: { age_visibility: "private" },
      moderationState: {
        ...moderationState,
        status: "active",
        recorded_status: "restricted",
        access_enabled: true,
      },
      role: "user",
    });
    expect(rpc).toHaveBeenCalledWith("get_own_account_status");
    expect(client.from).toHaveBeenCalledWith("profile_moderation_state");
    expect(builders.get("profile_moderation_state")?.select).toHaveBeenCalledWith(
      "profile_id,status,public_reason,restricted_until,created_at,updated_at",
    );
    expect(builders.get("profile_moderation_state")?.eq).toHaveBeenCalledWith(
      "profile_id",
      "user-1",
    );
  });

  it("atualiza somente o perfil do usuário injetado", async () => {
    const profile = { id: "user-1", full_name: "Ana" };
    const { client, builder } = updateClient(profile);
    const repository = createProfileDataRepository(client);

    await expect(repository.updateProfile("user-1", { full_name: "Ana" })).resolves.toBe(profile);
    expect(client.from).toHaveBeenCalledWith("profiles");
    expect(builder.update).toHaveBeenCalledWith({ full_name: "Ana" });
    expect(builder.eq).toHaveBeenCalledWith("id", "user-1");
  });

  it("conclui onboarding somente pela RPC server-authoritative", async () => {
    const profile = {
      id: "user-1",
      onboarding_step: 6,
      onboarding_completed_at: "2026-09-14T12:00:00Z",
    };
    const rpc = vi.fn().mockResolvedValue({ data: profile, error: null });
    const repository = createProfileDataRepository({ rpc } as unknown as SupabaseClient);

    await expect(repository.completeOnboarding("user-1")).resolves.toBe(profile);
    expect(rpc).toHaveBeenCalledWith("complete_own_onboarding");
  });

  it("rejeita conclusão retornada para outro perfil", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { id: "other-user", onboarding_completed_at: "2026-09-14T12:00:00Z" },
      error: null,
    });
    const repository = createProfileDataRepository({ rpc } as unknown as SupabaseClient);

    await expect(repository.completeOnboarding("user-1"))
      .rejects.toThrow("conclusão deste perfil");
  });

  it("atualiza detalhes somente pelo RPC own-only com patch allowlisted", async () => {
    const details = {
      profile_id: "user-1",
      personality: ["Acolhedor"],
      favorite_season: "Outono",
      social_energy: "Equilibrado",
      weekend_preferences: [],
      visited_places: [],
      desired_places: [],
      interests: ["Fé"],
      hobbies: [],
      favorite_movies: [],
      favorite_series: [],
      favorite_songs: [],
      favorite_artists: [],
      favorite_books: [],
      favorite_games: [],
    };
    const rpc = vi.fn().mockResolvedValue({ data: details, error: null });
    const client = { rpc } as unknown as SupabaseClient;
    const repository = createProfileDataRepository(client);

    await expect(repository.updateDetails("user-1", {
      personality: ["Acolhedor"],
      interests: ["Fé"],
    })).resolves.toBe(details);
    expect(rpc).toHaveBeenCalledWith("update_own_profile_details", {
      p_patch: {
        personality: ["Acolhedor"],
        interests: ["Fé"],
      },
    });
  });

  it("rejeita detalhes retornados para outro perfil", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { profile_id: "other-user" },
      error: null,
    });
    const repository = createProfileDataRepository({ rpc } as unknown as SupabaseClient);

    await expect(repository.updateDetails("user-1", { interests: ["Fé"] }))
      .rejects.toThrow("detalhes atualizados deste perfil");
  });

  it("mapeia a categoria de favorito para a coluna de details", async () => {
    const details = { profile_id: "user-1", favorite_movies: [{ label: "Interestelar" }] };
    const { client, builder } = updateClient(details);
    const repository = createProfileDataRepository(client);

    await repository.updateFavorite("user-1", "movies", [{ label: "Interestelar" }]);
    expect(client.from).toHaveBeenCalledWith("profile_details");
    expect(builder.update).toHaveBeenCalledWith({
      favorite_movies: [{ label: "Interestelar" }],
    });
    expect(builder.eq).toHaveBeenCalledWith("profile_id", "user-1");
  });

  it("salva as coleções do onboarding em uma atualização atômica separada", async () => {
    const details = { profile_id: "user-1" };
    const { client, builder } = updateClient(details);
    const repository = createProfileDataRepository(client);
    const collections = {
      movies: [{ label: "Interestelar" }],
      series: [],
      songs: [],
      artists: [],
      books: [{ label: "Cristianismo puro e simples" }],
      games: [],
    };

    await repository.updateFavorites("user-1", collections);

    expect(builder.update).toHaveBeenCalledWith({
      favorite_movies: collections.movies,
      favorite_series: [],
      favorite_songs: [],
      favorite_artists: [],
      favorite_books: collections.books,
      favorite_games: [],
    });
    expect(builder.eq).toHaveBeenCalledWith("profile_id", "user-1");
  });

  it("carrega configurações persistidas em user_settings", async () => {
    const settings = {
      profile_id: "user-1",
      analytics_enabled: false,
      analytics_consent_updated_at: null,
      locale: "pt-BR",
      timezone_name: "America/Sao_Paulo",
      reduced_motion: false,
      high_contrast: false,
      created_at: "2026-08-16T00:00:00Z",
      updated_at: "2026-08-16T00:00:00Z",
    };
    const { client, builder } = selectClient(settings);
    const repository = createProfileDataRepository(client);

    await expect(repository.loadSettings("user-1")).resolves.toBe(settings);
    expect(client.from).toHaveBeenCalledWith("user_settings");
    expect(builder.eq).toHaveBeenCalledWith("profile_id", "user-1");
  });

  it("atualiza preferências de acessibilidade em user_settings", async () => {
    const settings = {
      profile_id: "user-1",
      analytics_enabled: true,
      analytics_consent_updated_at: "2026-08-16T00:01:00Z",
      locale: "pt-BR",
      timezone_name: "America/Sao_Paulo",
      reduced_motion: true,
      high_contrast: true,
      created_at: "2026-08-16T00:00:00Z",
      updated_at: "2026-08-16T00:01:00Z",
    };
    const { client, builder } = updateClient(settings);
    const repository = createProfileDataRepository(client);

    await expect(repository.updateSettings("user-1", {
      reduced_motion: true,
      high_contrast: true,
    })).resolves.toBe(settings);
    expect(client.from).toHaveBeenCalledWith("user_settings");
    expect(builder.update).toHaveBeenCalledWith({
      reduced_motion: true,
      high_contrast: true,
    });
  });
});
