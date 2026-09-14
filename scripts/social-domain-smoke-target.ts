const STAGING_PROJECT_REF = "bgeauxljwjbtbwpbzpoo";
const STAGING_ORIGIN = `https://${STAGING_PROJECT_REF}.supabase.co`;

export function validateSocialSmokeTarget(
  supabaseUrl: string,
  linkedProjectRef: string,
): string {
  const url = new URL(supabaseUrl);
  if (
    url.origin !== STAGING_ORIGIN ||
    (url.pathname !== "/" && url.pathname !== "") ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    linkedProjectRef.trim() !== STAGING_PROJECT_REF
  ) {
    throw new Error(
      "Social-domain smoke is restricted to the linked ORHA staging project.",
    );
  }
  return url.origin;
}
