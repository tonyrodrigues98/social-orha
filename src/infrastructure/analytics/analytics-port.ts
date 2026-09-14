export const analyticsEventNames = [
  "orha_session_ready",
  "orha_page_view",
  "orha_runtime_error",
] as const;

export type AnalyticsEventName = (typeof analyticsEventNames)[number];
export type AnalyticsProperty = string | number | boolean | null;
export type AnalyticsProperties = Readonly<Record<string, AnalyticsProperty>>;
export type AnalyticsErrorSource = "window_error" | "unhandled_rejection";

export interface AnalyticsPort {
  readonly configured: boolean;
  readonly enabled: boolean;
  setConsent(granted: boolean, userId?: string): Promise<boolean>;
  track(event: AnalyticsEventName, properties?: AnalyticsProperties): void;
  captureError(error: unknown, source: AnalyticsErrorSource): void;
  reset(): void;
}

export interface AnalyticsEvent {
  readonly event: AnalyticsEventName;
  readonly properties?: AnalyticsProperties;
  readonly timestamp: number;
}

/** Test/development adapter. It never leaves the current JavaScript runtime. */
export class MemoryAnalyticsAdapter implements AnalyticsPort {
  readonly configured = true;
  enabled = false;
  readonly events: AnalyticsEvent[] = [];

  async setConsent(granted: boolean): Promise<boolean> {
    this.enabled = granted;
    if (!granted) this.events.length = 0;
    return this.enabled;
  }

  track(event: AnalyticsEventName, properties?: AnalyticsProperties) {
    if (!this.enabled) return;
    this.events.push({ event, properties, timestamp: Date.now() });
  }

  captureError(error: unknown, source: AnalyticsErrorSource) {
    this.track("orha_runtime_error", {
      source,
      error_type: analyticsErrorType(error),
    });
  }

  reset() {
    this.enabled = false;
    this.events.length = 0;
  }
}

/** Production-safe no-op used when an analytics service has not been provisioned. */
export class DisabledAnalyticsAdapter implements AnalyticsPort {
  readonly configured = false;
  readonly enabled = false;
  async setConsent(): Promise<boolean> { return false; }
  track() {}
  captureError() {}
  reset() {}
}

export function analyticsErrorType(error: unknown): string {
  if (error instanceof TypeError) return "TypeError";
  if (error instanceof RangeError) return "RangeError";
  if (error instanceof ReferenceError) return "ReferenceError";
  if (error instanceof SyntaxError) return "SyntaxError";
  if (typeof DOMException !== "undefined" && error instanceof DOMException) return "DOMException";
  if (error instanceof Error) return "Error";
  return "Unknown";
}
