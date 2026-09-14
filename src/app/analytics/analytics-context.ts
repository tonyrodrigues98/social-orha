import { createContext, useContext } from "react";
import type {
  AnalyticsErrorSource,
  AnalyticsEventName,
  AnalyticsProperties,
} from "@/infrastructure/analytics/analytics-port";

export type AnalyticsContextValue = {
  configured: boolean;
  active: boolean;
  track: (event: AnalyticsEventName, properties?: AnalyticsProperties) => void;
  captureError: (error: unknown, source: AnalyticsErrorSource) => void;
};

export const AnalyticsContext = createContext<AnalyticsContextValue | null>(null);

export function useAnalytics(): AnalyticsContextValue {
  const context = useContext(AnalyticsContext);
  if (!context) throw new Error("useAnalytics must be used within AnalyticsProvider");
  return context;
}
