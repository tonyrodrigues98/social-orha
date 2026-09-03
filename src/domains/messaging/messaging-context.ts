import { createContext, useContext } from "react";
import type { MessagingServices } from "./contracts";

export const MessagingContext = createContext<MessagingServices | null>(null);

export function useMessagingServices(): MessagingServices {
  const services = useContext(MessagingContext);
  if (!services) throw new Error("MessagingProvider precisa envolver as telas de conversas.");
  return services;
}
