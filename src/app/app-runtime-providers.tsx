import { useState, type ReactNode } from "react";
import { ExploreRepositoryProvider } from "@/domains/explore";
import { NotificationRepositoryProvider } from "@/domains/notifications";
import { SocialRepositoryProvider } from "@/domains/social";
import { SupportRepositoryProvider } from "@/domains/support";
import { TrustRepositoryProvider } from "@/domains/trust";
import { SupabaseMessagingProvider } from "@/infrastructure/supabase/messaging";
import {
  createSupabaseAppRuntimeAdapters,
  type AppRuntimeAdapters,
} from "./app-runtime-adapters";
import { OrhaQueryProvider } from "./query-provider";

export function AppRuntimeProviders({
  children,
  adapters: injectedAdapters,
}: {
  children: ReactNode;
  adapters?: AppRuntimeAdapters;
}) {
  const [adapters] = useState(
    () => injectedAdapters ?? createSupabaseAppRuntimeAdapters(),
  );

  return (
    <OrhaQueryProvider>
      <ExploreRepositoryProvider repository={adapters.explore}>
        <SocialRepositoryProvider repository={adapters.social}>
          <NotificationRepositoryProvider repository={adapters.notifications}>
            <TrustRepositoryProvider repository={adapters.trust}>
              <SupportRepositoryProvider repository={adapters.support}>
                <SupabaseMessagingProvider services={adapters.messaging}>
                  {children}
                </SupabaseMessagingProvider>
              </SupportRepositoryProvider>
            </TrustRepositoryProvider>
          </NotificationRepositoryProvider>
        </SocialRepositoryProvider>
      </ExploreRepositoryProvider>
    </OrhaQueryProvider>
  );
}
