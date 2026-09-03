import type {
  NotificationPage,
  NotificationPageRequest,
  NotificationPreferences,
  NotificationPreferencesUpdate,
  NotificationRealtimeEvent,
} from "./types";

export interface NotificationRepository {
  list(request?: NotificationPageRequest): Promise<NotificationPage>;
  markRead(notificationIds: readonly string[]): Promise<void>;
  markAllRead(): Promise<void>;
  getPreferences(): Promise<NotificationPreferences>;
  updatePreferences(input: NotificationPreferencesUpdate): Promise<NotificationPreferences>;
  subscribe(listener: (event: NotificationRealtimeEvent) => void): Promise<() => void>;
}
