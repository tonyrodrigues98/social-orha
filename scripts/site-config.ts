export const ORHA_SITE_TITLE = "ORHA";
export const ORHA_SITE_DESCRIPTION =
  "ORHA — uma rede social cristã para conhecer pessoas, criar vínculos e pertencer a comunidades.";

export type OrhaSiteMetadata = {
  title: string;
  description: string;
  canonicalUrl: string | null;
  socialImageUrl: string | null;
};

export function normalizeAppBase(configuredBase?: string): string {
  const candidate = configuredBase?.trim() || "/";
  if (
    !candidate.startsWith("/")
    || candidate.startsWith("//")
    || candidate.includes("\\")
    || candidate.includes("?")
    || candidate.includes("#")
    || candidate.split("/").some((segment) => segment === "." || segment === "..")
  ) {
    throw new Error(
      "VITE_ORHA_BASE_PATH deve ser um caminho absoluto seguro, como / ou /social-orha/.",
    );
  }
  return candidate.endsWith("/") ? candidate : `${candidate}/`;
}

export function normalizePublicOrigin(configuredOrigin?: string): string | null {
  const candidate = configuredOrigin?.trim();
  if (!candidate) return null;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("VITE_ORHA_PUBLIC_ORIGIN precisa ser uma origem HTTP(S) válida.");
  }
  const localDevelopment = url.protocol === "http:"
    && (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]");
  if (
    (url.protocol !== "https:" && !localDevelopment)
    || url.username
    || url.password
    || url.pathname !== "/"
    || url.search
    || url.hash
  ) {
    throw new Error(
      "VITE_ORHA_PUBLIC_ORIGIN deve conter somente uma origem HTTPS; HTTP é aceito apenas em localhost.",
    );
  }
  return url.origin;
}

export function createSiteMetadata({
  appBase,
  publicOrigin,
}: {
  appBase: string;
  publicOrigin?: string;
}): OrhaSiteMetadata {
  const normalizedBase = normalizeAppBase(appBase);
  const normalizedOrigin = normalizePublicOrigin(publicOrigin);
  const canonicalUrl = normalizedOrigin
    ? new URL(normalizedBase, `${normalizedOrigin}/`).toString()
    : null;
  return {
    title: ORHA_SITE_TITLE,
    description: ORHA_SITE_DESCRIPTION,
    canonicalUrl,
    socialImageUrl: canonicalUrl
      ? new URL("brand/orha-icon-512.png", canonicalUrl).toString()
      : null,
  };
}

