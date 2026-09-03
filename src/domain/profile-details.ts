import type { ProfileDetails } from "./identity";

export type EditableProfileDetails = Pick<
  ProfileDetails,
  | "personality"
  | "favorite_season"
  | "social_energy"
  | "weekend_preferences"
  | "visited_places"
  | "desired_places"
  | "interests"
  | "hobbies"
>;

export type EditableProfileDetailsPatch = Partial<EditableProfileDetails>;

type TextArrayLimit = {
  maxItems: number;
  maxItemCharacters: number;
  maxBytes: number;
};

export const profileDetailLimits = {
  patchMaxBytes: 16_384,
  personality: { maxItems: 5, maxItemCharacters: 80, maxBytes: 1_024 },
  weekend_preferences: { maxItems: 8, maxItemCharacters: 120, maxBytes: 2_048 },
  visited_places: { maxItems: 30, maxItemCharacters: 120, maxBytes: 8_192 },
  desired_places: { maxItems: 30, maxItemCharacters: 120, maxBytes: 8_192 },
  interests: { maxItems: 15, maxItemCharacters: 80, maxBytes: 4_096 },
  hobbies: { maxItems: 15, maxItemCharacters: 80, maxBytes: 4_096 },
  favoriteSeasonMaxCharacters: 80,
  socialEnergyMaxCharacters: 80,
} as const satisfies Record<string, number | TextArrayLimit>;

export const personalityOptions = [
  "Acolhedor",
  "Criativo",
  "Observador",
  "Comunicativo",
  "Tranquilo",
  "Aventureiro",
  "Sensível",
  "Bem-humorado",
] as const;

export const seasonOptions = ["Verão", "Outono", "Inverno", "Primavera"] as const;

export const socialEnergyOptions = [
  "Mais reservado",
  "Equilibrado",
  "Muito sociável",
] as const;

export const weekendOptions = [
  "Descansar",
  "Sair com amigos",
  "Igreja",
  "Cinema",
  "Natureza",
  "Cozinhar",
  "Jogar",
  "Conhecer lugares",
] as const;

export const interestOptions = [
  "Fé",
  "Música",
  "Cinema",
  "Livros",
  "Viagens",
  "Fotografia",
  "Tecnologia",
  "Esportes",
  "Arte",
  "Gastronomia",
  "Pets",
  "Voluntariado",
] as const;

export const hobbyOptions = [
  "Leitura",
  "Academia",
  "Caminhada",
  "Instrumentos",
  "Canto",
  "Jogos",
  "Fotografia",
  "Culinária",
  "Dança",
  "Jardinagem",
] as const;

function normalizeTextArray(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values) {
    const trimmed = value.normalize("NFKC").trim();
    const key = trimmed.toLocaleLowerCase("pt-BR");
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    normalized.push(trimmed);
  }
  return normalized;
}

function normalizeOptionalText(value: string | null): string | null {
  if (value === null) return null;
  return value.normalize("NFKC").trim() || null;
}

export function normalizeEditableProfileDetailsPatch(
  patch: EditableProfileDetailsPatch,
): EditableProfileDetailsPatch {
  const normalized: EditableProfileDetailsPatch = {};
  if (patch.personality) normalized.personality = normalizeTextArray(patch.personality);
  if ("favorite_season" in patch) {
    normalized.favorite_season = normalizeOptionalText(patch.favorite_season ?? null);
  }
  if ("social_energy" in patch) {
    normalized.social_energy = normalizeOptionalText(patch.social_energy ?? null);
  }
  if (patch.weekend_preferences) {
    normalized.weekend_preferences = normalizeTextArray(patch.weekend_preferences);
  }
  if (patch.visited_places) normalized.visited_places = normalizeTextArray(patch.visited_places);
  if (patch.desired_places) normalized.desired_places = normalizeTextArray(patch.desired_places);
  if (patch.interests) normalized.interests = normalizeTextArray(patch.interests);
  if (patch.hobbies) normalized.hobbies = normalizeTextArray(patch.hobbies);
  return normalized;
}

function characterLength(value: string): number {
  return Array.from(value).length;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function validateTextArray(
  label: string,
  values: readonly string[],
  limits: TextArrayLimit,
): string | null {
  if (values.length > limits.maxItems) {
    return `${label}: escolha no máximo ${limits.maxItems}.`;
  }
  if (values.some((value) => characterLength(value) > limits.maxItemCharacters)) {
    return `${label}: cada item deve ter no máximo ${limits.maxItemCharacters} caracteres.`;
  }
  if (byteLength(values.join("\u001f")) > limits.maxBytes) {
    return `${label}: o conteúdo ultrapassa o limite permitido.`;
  }
  return null;
}

export function validateEditableProfileDetailsPatch(
  patch: EditableProfileDetailsPatch,
): string | null {
  const normalized = normalizeEditableProfileDetailsPatch(patch);
  const patchBytes = byteLength(JSON.stringify(normalized));
  if (patchBytes > profileDetailLimits.patchMaxBytes) {
    return "Os detalhes do perfil ultrapassam o limite permitido.";
  }

  const arrays: Array<[
    keyof Pick<EditableProfileDetails, "personality" | "weekend_preferences" | "visited_places" | "desired_places" | "interests" | "hobbies">,
    string,
  ]> = [
    ["personality", "Personalidade"],
    ["weekend_preferences", "Fim de semana"],
    ["visited_places", "Lugares visitados"],
    ["desired_places", "Lugares desejados"],
    ["interests", "Interesses"],
    ["hobbies", "Hobbies"],
  ];

  for (const [key, label] of arrays) {
    const values = normalized[key];
    if (!values) continue;
    const error = validateTextArray(label, values, profileDetailLimits[key]);
    if (error) return error;
  }

  if (
    normalized.favorite_season
    && characterLength(normalized.favorite_season) > profileDetailLimits.favoriteSeasonMaxCharacters
  ) {
    return `Estação preferida: use no máximo ${profileDetailLimits.favoriteSeasonMaxCharacters} caracteres.`;
  }
  if (
    normalized.social_energy
    && characterLength(normalized.social_energy) > profileDetailLimits.socialEnergyMaxCharacters
  ) {
    return `Energia social: use no máximo ${profileDetailLimits.socialEnergyMaxCharacters} caracteres.`;
  }
  return null;
}
