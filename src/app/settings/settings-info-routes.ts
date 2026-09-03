export const SETTINGS_INFO_PATHS = {
  terms: "/configuracoes/termos",
  privacy: "/configuracoes/privacidade",
  help: "/configuracoes/ajuda",
  contact: "/configuracoes/contato",
} as const;

export type SettingsInfoRoute = keyof typeof SETTINGS_INFO_PATHS;
export type SettingsInfoPath = (typeof SETTINGS_INFO_PATHS)[SettingsInfoRoute];

export type SettingsInfoPageProps = {
  onBack: () => void;
};

export type SettingsInfoNavigationProps = {
  onNavigate?: (path: SettingsInfoPath) => void;
};

export function isSettingsInfoPath(value: string): value is SettingsInfoPath {
  return Object.values(SETTINGS_INFO_PATHS).some((path) => path === value);
}

export function buildSettingsInfoHref(
  path: SettingsInfoPath,
  baseUrl = import.meta.env.BASE_URL,
): string {
  const basePath = baseUrl === "/" ? "" : `/${baseUrl.split("/").filter(Boolean).join("/")}`;
  return `${basePath}${path}`;
}
