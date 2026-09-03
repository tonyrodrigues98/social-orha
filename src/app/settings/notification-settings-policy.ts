import type { NotificationPreferencesUpdate } from "@/domains/notifications";

/**
 * Only preferences backed by an active in-app producer are exposed at launch.
 * Critical account/moderation notices are mandatory. E-mail and push stay out of
 * the payload until a delivery worker/device subscription exists.
 */
export function buildLaunchNotificationPreferencesUpdate(
  draft: NotificationPreferencesUpdate,
): NotificationPreferencesUpdate {
  return {
    socialEnabled: draft.socialEnabled,
    messagesEnabled: draft.messagesEnabled,
    communityEnabled: draft.communityEnabled,
    quietHoursStart: draft.quietHoursStart,
    quietHoursEnd: draft.quietHoursEnd,
    systemEnabled: true,
    emailEnabled: false,
    pushEnabled: false,
  };
}
