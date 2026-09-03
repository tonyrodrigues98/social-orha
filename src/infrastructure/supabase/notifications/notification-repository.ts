import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import {
  NotificationError,
  categoryForNotificationType,
  decodeNotificationCursor,
  encodeNotificationCursor,
  knownCategorizedNotificationTypes,
  notificationTypesForCategory,
  type Notification,
  type NotificationActor,
  type NotificationPage,
  type NotificationPageRequest,
  type NotificationPreferences,
  type NotificationPreferencesUpdate,
  type NotificationRealtimeEvent,
  type NotificationRepository,
} from "@/domains/notifications";
import { getSupabaseClient } from "../client";

type PostgrestLikeError = {
  code?: string;
  message?: string;
  status?: number;
};

type NotificationRow = {
  id: string;
  recipient_id: string;
  actor_id: string | null;
  actor?: unknown;
  type: string;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
  read_at: string | null;
};

type PreferenceRow = {
  profile_id: string;
  social_enabled: boolean;
  messages_enabled: boolean;
  community_enabled: boolean;
  system_enabled: boolean;
  email_enabled: boolean;
  push_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  updated_at: string;
};

function mapError(error: unknown): NotificationError {
  if (error instanceof NotificationError) return error;
  const source = (error ?? {}) as PostgrestLikeError;
  const code = source.code ?? "";
  const status = source.status;
  if (status === 401 || code === "PGRST301") {
    return new NotificationError("authentication", "Sua sessão expirou. Entre novamente.", { cause: error });
  }
  if (status === 403 || code === "42501") {
    return new NotificationError("permission", "Você não tem permissão para esta ação.", { cause: error });
  }
  if (status === 409 || code === "23505") {
    return new NotificationError("conflict", "Esta alteração entrou em conflito com outra atualização.", { cause: error });
  }
  if (status === 404 || code === "P0002" || code === "PGRST116") {
    return new NotificationError("unavailable", "As preferências desta conta não estão disponíveis.", { cause: error });
  }
  if (status === 429) {
    return new NotificationError("rate_limit", "Muitas tentativas. Aguarde um momento.", { cause: error });
  }
  if (status === 503 || status === 504 || code === "PGRST003") {
    return new NotificationError("unavailable", "O servidor está temporariamente indisponível.", { cause: error });
  }
  if (status === 400 || code === "22023" || code === "23514") {
    return new NotificationError("validation", "Os dados enviados não são válidos.", { cause: error });
  }
  if (error instanceof TypeError || /fetch|network|offline/i.test(source.message ?? "")) {
    return new NotificationError("network", "Sem conexão com o servidor. Verifique sua internet.", { cause: error });
  }
  return new NotificationError("unknown", "Não foi possível concluir a operação agora.", { cause: error });
}

function actorFromRelation(value: unknown): NotificationActor | null {
  const relation = Array.isArray(value) ? value[0] : value;
  if (!relation || typeof relation !== "object") return null;
  const row = relation as Record<string, unknown>;
  if (typeof row.id !== "string") return null;
  return {
    id: row.id,
    fullName: typeof row.full_name === "string" ? row.full_name : null,
    username: typeof row.username === "string" ? row.username : null,
    avatarPath: typeof row.avatar_path === "string" ? row.avatar_path : null,
  };
}

export function mapNotificationRow(row: NotificationRow): Notification {
  return {
    id: row.id,
    recipientId: row.recipient_id,
    actorId: row.actor_id,
    actor: actorFromRelation(row.actor),
    type: row.type,
    category: categoryForNotificationType(row.type),
    entityType: row.entity_type,
    entityId: row.entity_id,
    createdAt: row.created_at,
    readAt: row.read_at,
  };
}

export function mapPreferenceRow(row: PreferenceRow): NotificationPreferences {
  return {
    profileId: row.profile_id,
    socialEnabled: row.social_enabled,
    messagesEnabled: row.messages_enabled,
    communityEnabled: row.community_enabled,
    systemEnabled: row.system_enabled,
    emailEnabled: row.email_enabled,
    pushEnabled: row.push_enabled,
    quietHoursStart: row.quiet_hours_start,
    quietHoursEnd: row.quiet_hours_end,
    updatedAt: row.updated_at,
  };
}

async function requireUserId(client: SupabaseClient): Promise<string> {
  const { data, error } = await client.auth.getUser();
  if (error) throw mapError(error);
  if (!data.user) throw new NotificationError("authentication", "Entre para acessar suas notificações.");
  return data.user.id;
}

export class SupabaseNotificationRepository implements NotificationRepository {
  constructor(private readonly client: SupabaseClient = getSupabaseClient()) {}

  async list(request: NotificationPageRequest = {}): Promise<NotificationPage> {
    const limit = Math.min(Math.max(request.limit ?? 20, 1), 50);
    let query = this.client
      .from("notifications")
      .select(
        "id,recipient_id,actor_id,type,entity_type,entity_id,created_at,read_at,actor:profiles!notifications_actor_id_fkey(id,full_name,username,avatar_path)",
      )
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);

    if (request.unreadOnly) query = query.is("read_at", null);
    if (request.category && request.category !== "all") {
      if (request.category === "system") {
        query = query.not("type", "in", `(${knownCategorizedNotificationTypes().join(",")})`);
      } else {
        query = query.in("type", [...notificationTypesForCategory(request.category)]);
      }
    }

    if (request.cursor) {
      const cursor = decodeNotificationCursor(request.cursor);
      if (!cursor) throw new NotificationError("validation", "O cursor de paginação é inválido.");
      query = query.or(
        `created_at.lt."${cursor.createdAt}",and(created_at.eq."${cursor.createdAt}",id.lt.${cursor.id})`,
      );
    }
    if (request.signal) query = query.abortSignal(request.signal);

    const [listResult, countResult] = await Promise.all([
      query,
      this.client.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
    ]);
    if (listResult.error) throw mapError(listResult.error);
    if (countResult.error) throw mapError(countResult.error);

    const rows = (listResult.data ?? []) as unknown as NotificationRow[];
    const hasMore = rows.length > limit;
    const visibleRows = rows.slice(0, limit);
    const last = visibleRows.at(-1);
    return {
      items: visibleRows.map(mapNotificationRow),
      nextCursor: hasMore && last ? encodeNotificationCursor({ createdAt: last.created_at, id: last.id }) : null,
      unreadCount: countResult.count ?? 0,
    };
  }

  async markRead(notificationIds: readonly string[]): Promise<void> {
    const ids = [...new Set(notificationIds)].slice(0, 100);
    if (ids.length === 0) return;
    const { error } = await this.client.rpc("mark_notifications_read", {
      p_notification_ids: ids,
    });
    if (error) throw mapError(error);
  }

  async markAllRead(): Promise<void> {
    const { error } = await this.client.rpc("mark_notifications_read", {
      p_notification_ids: null,
    });
    if (error) throw mapError(error);
  }

  async getPreferences(): Promise<NotificationPreferences> {
    const userId = await requireUserId(this.client);
    const { data, error } = await this.client
      .from("notification_preferences")
      .select("*")
      .eq("profile_id", userId)
      .single();
    if (error) throw mapError(error);
    return mapPreferenceRow(data as PreferenceRow);
  }

  async updatePreferences(input: NotificationPreferencesUpdate): Promise<NotificationPreferences> {
    const userId = await requireUserId(this.client);
    const values = {
      social_enabled: input.socialEnabled,
      messages_enabled: input.messagesEnabled,
      community_enabled: input.communityEnabled,
      system_enabled: input.systemEnabled,
      email_enabled: input.emailEnabled,
      push_enabled: input.pushEnabled,
      quiet_hours_start: input.quietHoursStart,
      quiet_hours_end: input.quietHoursEnd,
    };
    const { data, error } = await this.client
      .from("notification_preferences")
      .update(values)
      .eq("profile_id", userId)
      .select("*")
      .single();
    if (error) throw mapError(error);
    return mapPreferenceRow(data as PreferenceRow);
  }

  async subscribe(listener: (event: NotificationRealtimeEvent) => void): Promise<() => void> {
    const userId = await requireUserId(this.client);
    let channel: RealtimeChannel | null = this.client
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => {
          const next = payload.new as Record<string, unknown>;
          const previous = payload.old as Record<string, unknown>;
          const id = typeof next.id === "string" ? next.id : previous.id;
          if (typeof id !== "string") return;
          listener({ kind: payload.eventType === "INSERT" ? "created" : "updated", notificationId: id });
        },
      );

    try {
      await new Promise<void>((resolve, reject) => {
        channel?.subscribe((status) => {
          if (status === "SUBSCRIBED") resolve();
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            reject(
              new NotificationError(
                "unavailable",
                "As notificações em tempo real estão temporariamente indisponíveis.",
              ),
            );
          }
        });
      });
    } catch (error) {
      if (channel) await this.client.removeChannel(channel);
      channel = null;
      throw mapError(error);
    }

    return () => {
      if (!channel) return;
      const activeChannel = channel;
      channel = null;
      void this.client.removeChannel(activeChannel);
    };
  }
}
