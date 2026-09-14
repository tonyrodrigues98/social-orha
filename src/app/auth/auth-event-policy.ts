import type { AuthChangeEvent } from "@supabase/supabase-js";

const eventsThatPreserveHydratedIdentity = new Set<AuthChangeEvent>([
  "SIGNED_IN",
  "TOKEN_REFRESHED",
  "USER_UPDATED",
]);

export function canReuseHydratedIdentity(
  event: AuthChangeEvent,
  hydratedUserId: string | null,
  nextUserId: string,
): boolean {
  return hydratedUserId === nextUserId && eventsThatPreserveHydratedIdentity.has(event);
}
