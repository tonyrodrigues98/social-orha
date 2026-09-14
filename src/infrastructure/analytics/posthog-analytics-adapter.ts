import type { PostHog } from "posthog-js";
import {
  DisabledAnalyticsAdapter,
  analyticsEventNames,
  analyticsErrorType,
  type AnalyticsErrorSource,
  type AnalyticsEventName,
  type AnalyticsPort,
  type AnalyticsProperties,
} from "./analytics-port";

type PostHogModule = { default: PostHog };
type PostHogImporter = () => Promise<PostHogModule>;

export type PostHogAnalyticsConfig = {
  projectKey: string;
  apiHost: string;
};

const allowedProperties: Record<AnalyticsEventName, ReadonlySet<string>> = {
  orha_session_ready: new Set(["role", "onboarding_complete"]),
  orha_page_view: new Set(["route_id"]),
  orha_runtime_error: new Set(["source", "error_type"]),
};

const privateAutomaticProperties = new Set([
  "$current_url",
  "$pathname",
  "$referrer",
  "$referring_domain",
  "$initial_current_url",
  "$initial_pathname",
  "$initial_referrer",
  "$initial_referring_domain",
]);

function safeProperties(
  event: AnalyticsEventName,
  properties: AnalyticsProperties = {},
): Record<string, string | number | boolean | null> {
  const allowed = allowedProperties[event];
  return Object.fromEntries(
    Object.entries(properties)
      .filter(([key]) => allowed.has(key))
      .map(([key, value]) => [key, typeof value === "string" ? value.slice(0, 120) : value]),
  );
}

export class PostHogAnalyticsAdapter implements AnalyticsPort {
  readonly configured = true;
  enabled = false;
  private clientPromise: Promise<PostHog> | null = null;
  private userId: string | null = null;
  private consentRevision = 0;

  constructor(
    private readonly config: PostHogAnalyticsConfig,
    private readonly importPostHog: PostHogImporter = () => import("posthog-js"),
  ) {}

  private loadClient(): Promise<PostHog> {
    if (this.clientPromise) return this.clientPromise;
    this.clientPromise = this.importPostHog().then(({ default: client }) => {
      client.init(this.config.projectKey, {
        api_host: this.config.apiHost,
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        capture_exceptions: false,
        capture_heatmaps: false,
        capture_performance: false,
        disable_session_recording: true,
        disable_surveys: true,
        advanced_disable_feature_flags: true,
        opt_out_capturing_by_default: true,
        opt_out_persistence_by_default: true,
        person_profiles: "identified_only",
        respect_dnt: true,
        mask_all_text: true,
        mask_all_element_attributes: true,
        before_send: (event) => {
          if (!event) return null;
          if (!analyticsEventNames.includes(event.event as AnalyticsEventName)) return null;
          for (const property of privateAutomaticProperties) delete event.properties[property];
          return event;
        },
      });
      return client;
    });
    return this.clientPromise;
  }

  async setConsent(granted: boolean, userId?: string): Promise<boolean> {
    const revision = ++this.consentRevision;
    const nextUserId = userId?.trim() || null;
    if (!granted) {
      this.enabled = false;
      this.userId = null;
      if (this.clientPromise) {
        const client = await this.clientPromise;
        client.reset(true);
        client.opt_out_capturing();
      }
      return false;
    }

    if (this.enabled && this.userId === nextUserId) return true;
    const client = await this.loadClient();
    if (revision !== this.consentRevision) return this.enabled;
    // reset() clears consent; therefore it must run before opt_in_capturing().
    client.reset(true);
    client.opt_in_capturing({ captureEventName: false });
    if (nextUserId) client.identify(nextUserId);
    this.userId = nextUserId;
    this.enabled = true;
    return true;
  }

  track(event: AnalyticsEventName, properties?: AnalyticsProperties): void {
    if (!this.enabled || !this.clientPromise) return;
    void this.clientPromise.then((client) => {
      if (this.enabled) client.capture(event, safeProperties(event, properties));
    });
  }

  captureError(error: unknown, source: AnalyticsErrorSource): void {
    this.track("orha_runtime_error", { source, error_type: analyticsErrorType(error) });
  }

  reset(): void {
    this.consentRevision += 1;
    this.enabled = false;
    this.userId = null;
    if (!this.clientPromise) return;
    void this.clientPromise.then((client) => {
      client.reset(true);
      client.opt_out_capturing();
    });
  }
}

export function createAnalyticsAdapter(
  environment: Pick<ImportMetaEnv, "VITE_ORHA_POSTHOG_KEY" | "VITE_ORHA_POSTHOG_HOST"> = import.meta.env,
): AnalyticsPort {
  const projectKey = environment.VITE_ORHA_POSTHOG_KEY?.trim();
  const apiHost = environment.VITE_ORHA_POSTHOG_HOST?.trim();
  if (!projectKey || !apiHost) return new DisabledAnalyticsAdapter();

  try {
    const parsedHost = new URL(apiHost);
    if (parsedHost.protocol !== "https:") return new DisabledAnalyticsAdapter();
  } catch {
    return new DisabledAnalyticsAdapter();
  }
  return new PostHogAnalyticsAdapter({ projectKey, apiHost });
}
