import { useState, type ReactNode } from "react";
import { MessagingProvider, type MessagingServices } from "@/domains/messaging";
import { createSupabaseMessagingServices } from "./services";

export function SupabaseMessagingProvider({
  children,
  services: injectedServices,
}: {
  children: ReactNode;
  services?: MessagingServices;
}) {
  const [services] = useState(() => injectedServices ?? createSupabaseMessagingServices());
  return <MessagingProvider services={services}>{children}</MessagingProvider>;
}
