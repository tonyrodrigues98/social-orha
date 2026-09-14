import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AnalyticsPort } from "@/infrastructure/analytics/analytics-port";
import { createAnalyticsAdapter } from "@/infrastructure/analytics/posthog-analytics-adapter";
import { useOwnProfileSettingsQuery } from "../profile/profile-queries";
import { appRouter } from "../router";
import { useAuth } from "../auth/auth-context";
import { AnalyticsContext } from "./analytics-context";

function currentRouteId(): string {
  const routeId = appRouter.state.matches.at(-1)?.routeId;
  return typeof routeId === "string" ? routeId.slice(0, 120) : "unknown";
}

export function AnalyticsProvider({
  children,
  adapter: injectedAdapter,
}: {
  children: ReactNode;
  adapter?: AnalyticsPort;
}) {
  const auth = useAuth();
  const [adapter] = useState(() => injectedAdapter ?? createAnalyticsAdapter());
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const settings = useOwnProfileSettingsQuery(auth.user?.id ?? "");
  const trackedSession = useRef<string | null>(null);

  useEffect(() => {
    const userId = auth.status === "ready" ? auth.user?.id : undefined;
    const consent = settings.data?.analytics_enabled === true;
    let cancelled = false;

    if (!userId || !settings.data) {
      adapter.reset();
      trackedSession.current = null;
      return;
    }

    void adapter.setConsent(consent, userId)
      .then((enabled) => {
        if (cancelled) return;
        setActiveUserId(enabled ? userId : null);
        if (!enabled) {
          trackedSession.current = null;
          return;
        }
        const sessionKey = `${userId}:${auth.session?.access_token.slice(-12) ?? "session"}`;
        if (trackedSession.current === sessionKey) return;
        trackedSession.current = sessionKey;
        adapter.track("orha_session_ready", {
          role: auth.identity?.role ?? "user",
          onboarding_complete: Boolean(auth.identity?.profile.onboarding_completed_at),
        });
        adapter.track("orha_page_view", { route_id: currentRouteId() });
      })
      .catch(() => {
        if (!cancelled) {
          adapter.reset();
          setActiveUserId(null);
        }
      });

    return () => { cancelled = true; };
  }, [
    adapter,
    auth.identity?.profile.onboarding_completed_at,
    auth.identity?.role,
    auth.session?.access_token,
    auth.status,
    auth.user?.id,
    settings.data,
  ]);

  useEffect(() => appRouter.subscribe("onResolved", ({ pathChanged }) => {
    if (pathChanged) adapter.track("orha_page_view", { route_id: currentRouteId() });
  }), [adapter]);

  useEffect(() => {
    const onError = (event: ErrorEvent) => adapter.captureError(event.error, "window_error");
    const onUnhandledRejection = (event: PromiseRejectionEvent) => (
      adapter.captureError(event.reason, "unhandled_rejection")
    );
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, [adapter]);

  const value = useMemo(() => ({
    configured: adapter.configured,
    active: activeUserId === auth.user?.id && settings.data?.analytics_enabled === true,
    track: adapter.track.bind(adapter),
    captureError: adapter.captureError.bind(adapter),
  }), [activeUserId, adapter, auth.user?.id, settings.data?.analytics_enabled]);

  return <AnalyticsContext.Provider value={value}>{children}</AnalyticsContext.Provider>;
}
