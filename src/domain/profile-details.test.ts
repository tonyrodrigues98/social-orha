import { describe, expect, it } from "vitest";
import {
  normalizeEditableProfileDetailsPatch,
  validateEditableProfileDetailsPatch,
} from "./profile-details";

describe("editable profile details", () => {
  it("normalizes whitespace, unicode and case-insensitive duplicates", () => {
    expect(normalizeEditableProfileDetailsPatch({
      personality: ["  Acolhedor ", "acolhedor", ""],
      favorite_season: "  Outono ",
      interests: ["Fé", "Fé", " Cinema  "],
    })).toEqual({
      personality: ["Acolhedor"],
      favorite_season: "Outono",
      interests: ["Fé", "Cinema"],
    });
  });

  it("keeps explicit scalar removal in a partial patch", () => {
    expect(normalizeEditableProfileDetailsPatch({
      favorite_season: "   ",
      social_energy: null,
    })).toEqual({ favorite_season: null, social_energy: null });
  });

  it("enforces the same item limits used by the server", () => {
    expect(validateEditableProfileDetailsPatch({
      personality: ["1", "2", "3", "4", "5", "6"],
    })).toBe("Personalidade: escolha no máximo 5.");
    expect(validateEditableProfileDetailsPatch({
      hobbies: ["x".repeat(81)],
    })).toBe("Hobbies: cada item deve ter no máximo 80 caracteres.");
  });

  it("accepts a valid complete enrichment patch", () => {
    expect(validateEditableProfileDetailsPatch({
      personality: ["Acolhedor"],
      favorite_season: "Outono",
      social_energy: "Equilibrado",
      weekend_preferences: ["Cinema"],
      interests: ["Fé", "Música"],
      hobbies: ["Leitura"],
      visited_places: ["Recife"],
      desired_places: ["Jerusalém"],
    })).toBeNull();
  });
});
