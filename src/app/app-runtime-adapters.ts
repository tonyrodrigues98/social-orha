import type { AdministrationRepository } from "@/domains/administration";
import type { ExploreRepository } from "@/domains/explore";
import type { MessagingServices } from "@/domains/messaging";
import type { NotificationRepository } from "@/domains/notifications";
import type { SocialRepository } from "@/domains/social";
import type { SupportRepository } from "@/domains/support";
import type { TrustRepository } from "@/domains/trust";
import { createSupabaseAdministrationRepository } from "@/infrastructure/supabase/administration";
import { getSupabaseClient } from "@/infrastructure/supabase/client";
import { createSupabaseExploreRepository } from "@/infrastructure/supabase/explore";
import { createSupabaseMessagingServices } from "@/infrastructure/supabase/messaging";
import { SupabaseNotificationRepository } from "@/infrastructure/supabase/notifications";
import { createSupabaseSocialRepository } from "@/infrastructure/supabase/social";
import { createSupabaseSupportRepository } from "@/infrastructure/supabase/support";
import { SupabaseTrustRepository } from "@/infrastructure/supabase/trust";

export type AppRuntimeAdapters = {
  administration: AdministrationRepository;
  explore: ExploreRepository;
  social: SocialRepository;
  notifications: NotificationRepository;
  trust: TrustRepository;
  support: SupportRepository;
  messaging: MessagingServices;
};

export function createSupabaseAppRuntimeAdapters(): AppRuntimeAdapters {
  const client = getSupabaseClient();
  return {
    administration: createSupabaseAdministrationRepository(client),
    explore: createSupabaseExploreRepository(client),
    social: createSupabaseSocialRepository(client),
    notifications: new SupabaseNotificationRepository(client),
    trust: new SupabaseTrustRepository(client),
    support: createSupabaseSupportRepository(client),
    messaging: createSupabaseMessagingServices(client),
  };
}
