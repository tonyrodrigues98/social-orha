export type AuthenticatedRuntimeCleanup = {
  clearQueryCache: () => void;
  revokeObjectUrls: () => void;
  removeRealtimeChannels: () => Promise<unknown> | unknown;
};

/**
 * Clears every user-scoped runtime resource exactly at an auth-principal
 * boundary. Token refreshes and repeated events for the same principal are
 * deliberately ignored so live queries and subscriptions remain stable.
 */
export function clearRuntimeOnAuthPrincipalChange(
  previousUserId: string | null,
  nextUserId: string | null,
  cleanup: AuthenticatedRuntimeCleanup,
): boolean {
  if (previousUserId === nextUserId) return false;

  try {
    cleanup.clearQueryCache();
  } catch {
    // Authentication must still progress even if a defensive cleanup fails.
  }
  try {
    cleanup.revokeObjectUrls();
  } catch {
    // Object URL support can be unavailable in non-browser renderers.
  }
  try {
    void Promise.resolve(cleanup.removeRealtimeChannels()).catch(() => undefined);
  } catch {
    // A disconnected realtime client must not block sign-out or account swap.
  }
  return true;
}
