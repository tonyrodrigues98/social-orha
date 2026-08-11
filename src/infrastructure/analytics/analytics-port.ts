export interface AnalyticsPort {
  track(event: string, properties?: Record<string, unknown>): void;
  identify(userId: string, traits?: Record<string, unknown>): void;
  reset(): void;
}

export interface AnalyticsEvent {
  readonly event: string;
  readonly properties?: Record<string, unknown>;
  readonly timestamp: number;
}

export class MemoryAnalyticsAdapter implements AnalyticsPort {
  readonly events: AnalyticsEvent[] = [];

  track(event: string, properties?: Record<string, unknown>) {
    this.events.push({ event, properties, timestamp: Date.now() });
  }

  identify() {}

  reset() {
    this.events.length = 0;
  }
}
