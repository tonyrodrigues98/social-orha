export const brazilianStates = [
  ["AC", "Acre"], ["AL", "Alagoas"], ["AP", "Amapá"], ["AM", "Amazonas"],
  ["BA", "Bahia"], ["CE", "Ceará"], ["DF", "Distrito Federal"], ["ES", "Espírito Santo"],
  ["GO", "Goiás"], ["MA", "Maranhão"], ["MT", "Mato Grosso"], ["MS", "Mato Grosso do Sul"],
  ["MG", "Minas Gerais"], ["PA", "Pará"], ["PB", "Paraíba"], ["PR", "Paraná"],
  ["PE", "Pernambuco"], ["PI", "Piauí"], ["RJ", "Rio de Janeiro"], ["RN", "Rio Grande do Norte"],
  ["RS", "Rio Grande do Sul"], ["RO", "Rondônia"], ["RR", "Roraima"], ["SC", "Santa Catarina"],
  ["SP", "São Paulo"], ["SE", "Sergipe"], ["TO", "Tocantins"],
] as const;

type IbgeCity = { id: number; nome: string };

const cityCache = new Map<string, string[]>();

export async function getCitiesForState(stateCode: string): Promise<string[]> {
  const normalized = stateCode.toUpperCase();
  const cached = cityCache.get(normalized);
  if (cached) return cached;

  const response = await fetch(
    `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${encodeURIComponent(normalized)}/municipios?orderBy=nome`,
  );

  if (!response.ok) throw new Error("Não foi possível carregar as cidades.");

  const cities = ((await response.json()) as IbgeCity[]).map((city) => city.nome);
  cityCache.set(normalized, cities);
  return cities;
}
