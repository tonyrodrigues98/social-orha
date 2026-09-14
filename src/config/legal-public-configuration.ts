export const LEGAL_PUBLIC_ENV_KEYS = [
  "VITE_ORHA_LEGAL_OPERATOR_NAME",
  "VITE_ORHA_LEGAL_CONTROLLER_NAME",
  "VITE_ORHA_LEGAL_ADDRESS",
  "VITE_ORHA_LEGAL_FORUM",
  "VITE_ORHA_LEGAL_EFFECTIVE_DATE",
  "VITE_ORHA_SUPPORT_EMAIL",
  "VITE_ORHA_PRIVACY_EMAIL",
] as const;

export type LegalPublicEnvironmentKey = (typeof LEGAL_PUBLIC_ENV_KEYS)[number];
export type LegalPublicEnvironment = Partial<Record<LegalPublicEnvironmentKey, string>>;

export type LegalPublicConfiguration = {
  operatorName: string | null;
  controllerName: string | null;
  address: string | null;
  forum: string | null;
  effectiveDate: string | null;
  supportEmail: string | null;
  privacyEmail: string | null;
  missingKeys: LegalPublicEnvironmentKey[];
  isComplete: boolean;
};

function normalizedText(value: string | undefined, maximum: number): string | null {
  const normalized = value?.trim().replace(/\s+/g, " ") ?? "";
  if (!normalized || normalized.length > maximum || /[\r\n\0]/.test(value ?? "")) {
    return null;
  }
  return normalized;
}

export function normalizePublicEmail(value: string | undefined): string | null {
  const normalized = normalizedText(value, 254);
  return normalized && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
    ? normalized.toLowerCase()
    : null;
}

export function normalizeIsoDate(value: string | undefined): string | null {
  const normalized = value?.trim() ?? "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return date.toISOString().slice(0, 10) === normalized ? normalized : null;
}

export function legalPublicConfigurationFromEnvironment(
  environment: LegalPublicEnvironment,
): LegalPublicConfiguration {
  const values = {
    VITE_ORHA_LEGAL_OPERATOR_NAME: normalizedText(
      environment.VITE_ORHA_LEGAL_OPERATOR_NAME,
      160,
    ),
    VITE_ORHA_LEGAL_CONTROLLER_NAME: normalizedText(
      environment.VITE_ORHA_LEGAL_CONTROLLER_NAME,
      160,
    ),
    VITE_ORHA_LEGAL_ADDRESS: normalizedText(
      environment.VITE_ORHA_LEGAL_ADDRESS,
      300,
    ),
    VITE_ORHA_LEGAL_FORUM: normalizedText(
      environment.VITE_ORHA_LEGAL_FORUM,
      160,
    ),
    VITE_ORHA_LEGAL_EFFECTIVE_DATE: normalizeIsoDate(
      environment.VITE_ORHA_LEGAL_EFFECTIVE_DATE,
    ),
    VITE_ORHA_SUPPORT_EMAIL: normalizePublicEmail(
      environment.VITE_ORHA_SUPPORT_EMAIL,
    ),
    VITE_ORHA_PRIVACY_EMAIL: normalizePublicEmail(
      environment.VITE_ORHA_PRIVACY_EMAIL,
    ),
  } satisfies Record<LegalPublicEnvironmentKey, string | null>;
  const missingKeys = LEGAL_PUBLIC_ENV_KEYS.filter((key) => values[key] === null);

  return {
    operatorName: values.VITE_ORHA_LEGAL_OPERATOR_NAME,
    controllerName: values.VITE_ORHA_LEGAL_CONTROLLER_NAME,
    address: values.VITE_ORHA_LEGAL_ADDRESS,
    forum: values.VITE_ORHA_LEGAL_FORUM,
    effectiveDate: values.VITE_ORHA_LEGAL_EFFECTIVE_DATE,
    supportEmail: values.VITE_ORHA_SUPPORT_EMAIL,
    privacyEmail: values.VITE_ORHA_PRIVACY_EMAIL,
    missingKeys,
    isComplete: missingKeys.length === 0,
  };
}

export function formatLegalEffectiveDate(value: string | null): string {
  if (!value) return "16 de agosto de 2026";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}
