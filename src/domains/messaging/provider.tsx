import type { ReactNode } from "react";
import type { MessagingServices } from "./contracts";
import { MessagingContext } from "./messaging-context";

export function MessagingProvider({ services, children }: { services: MessagingServices; children: ReactNode }) {
  return <MessagingContext.Provider value={services}>{children}</MessagingContext.Provider>;
}
