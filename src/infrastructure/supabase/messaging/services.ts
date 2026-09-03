import type { SupabaseClient } from "@supabase/supabase-js";
import type { MessagingServices } from "@/domains/messaging";
import { getSupabaseClient } from "../client";
import { SupabaseMessagingMediaRepository } from "./supabase-messaging-media-repository";
import { SupabaseMessagingRealtimeRepository } from "./supabase-messaging-realtime-repository";
import { SupabaseMessagingRepository } from "./supabase-messaging-repository";

export function createSupabaseMessagingServices(
  client: SupabaseClient = getSupabaseClient(),
): MessagingServices {
  const media = new SupabaseMessagingMediaRepository(client);
  const repository = new SupabaseMessagingRepository(client, media);
  const realtime = new SupabaseMessagingRealtimeRepository(client, repository);
  return { repository, media, realtime };
}
