import type { ExploreRepository } from "@/domains/explore";
import type { MessagingServices } from "@/domains/messaging";
import type { NotificationRepository } from "@/domains/notifications";
import type { SocialRepository } from "@/domains/social";
import type { TrustRepository } from "@/domains/trust";
import { getSupabaseClient } from "@/infrastructure/supabase/client";
import { createSupabaseExploreRepository } from "@/infrastructure/supabase/explore";
import { createSupabaseMessagingServices } from "@/infrastructure/supabase/messaging";
import { SupabaseNotificationRepository } from "@/infrastructure/supabase/notifications";
import { createSupabaseSocialRepository } from "@/infrastructure/supabase/social";
import { SupabaseTrustRepository } from "@/infrastructure/supabase/trust";

export type AppRuntimeAdapters = {
  explore: ExploreRepository;
  social: SocialRepository;
  notifications: NotificationRepository;
  trust: TrustRepository;
  messaging: MessagingServices;
};

export function createSupabaseAppRuntimeAdapters(): AppRuntimeAdapters {
  const client = getSupabaseClient();
  return {
    explore: createSupabaseExploreRepository(client),
    social: createSupabaseSocialRepository(client),
    notifications: new SupabaseNotificationRepository(client),
    trust: new SupabaseTrustRepository(client),
    messaging: createSupabaseMessagingServices(client),
  };
}
