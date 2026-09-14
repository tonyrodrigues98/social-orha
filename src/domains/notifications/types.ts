export type NotificationCategory = "important" | "social" | "messages" | "system";

export type NotificationActor = {
  id: string;
  fullName: string | null;
  username: string | null;
  avatarPath: string | null;
};

export type Notification = {
  id: string;
  recipientId: string;
  actorId: string | null;
  actor: NotificationActor | null;
  type: string;
  category: NotificationCategory;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
  readAt: string | null;
};

export type NotificationPageRequest = {
  category?: NotificationCategory | "all";
  unreadOnly?: boolean;
  cursor?: string | null;
  limit?: number;
  signal?: AbortSignal;
};

export type NotificationPage = {
  items: Notification[];
  nextCursor: string | null;
  unreadCount: number;
};

export type NotificationPreferences = {
  profileId: string;
  socialEnabled: boolean;
  messagesEnabled: boolean;
  communityEnabled: boolean;
  systemEnabled: boolean;
  emailEnabled: boolean;
  pushEnabled: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  updatedAt: string;
};

export type NotificationPreferencesUpdate = Omit<
  NotificationPreferences,
  "profileId" | "updatedAt"
>;

export type NotificationRealtimeEvent = {
  kind: "created" | "updated";
  notificationId: string;
};

export type NotificationPresentation = {
  title: string;
  description: string;
  targetPath: string | null;
};

const SOCIAL_TYPES = new Set([
  "friendship_request",
  "friendship_accepted",
  "friendship_declined",
  "profile_mention",
  "post_comment",
  "post_commented",
  "post_reaction",
  "comment_reply",
  "comment_replied",
  "content_reacted",
]);

const MESSAGE_TYPES = new Set([
  "conversation_request",
  "conversation_request_accepted",
  "conversation_request_declined",
  "group_invitation",
  "message_received",
  "message_reaction",
]);

const IMPORTANT_TYPES = new Set([
  "security_alert",
  "account_warning",
  "moderation_action",
  "support_ticket_reply",
  "support_ticket_updated",
  "account_role_changed",
]);

export function notificationTypesForCategory(
  category: Exclude<NotificationCategory, "system">,
): readonly string[] {
  if (category === "important") return [...IMPORTANT_TYPES];
  if (category === "messages") return [...MESSAGE_TYPES];
  return [...SOCIAL_TYPES, "community_post", "community_invite", "community_membership"];
}

export function knownCategorizedNotificationTypes(): readonly string[] {
  return [
    ...notificationTypesForCategory("important"),
    ...notificationTypesForCategory("messages"),
    ...notificationTypesForCategory("social"),
  ];
}

export function categoryForNotificationType(type: string): NotificationCategory {
  if (IMPORTANT_TYPES.has(type)) return "important";
  if (MESSAGE_TYPES.has(type)) return "messages";
  if (SOCIAL_TYPES.has(type) || type.startsWith("community_")) return "social";
  return "system";
}

function profilePath(actor: NotificationActor | null): string | null {
  return actor?.username ? `/perfil/${encodeURIComponent(actor.username)}` : null;
}

export function presentNotification(notification: Notification): NotificationPresentation {
  const actorName = notification.actor?.fullName?.trim() || "Alguém";
  const entityId = notification.entityId ? encodeURIComponent(notification.entityId) : null;
  const conversationPath = notification.entityType === "conversation" && entityId
    ? `/conversas/${entityId}`
    : "/conversas";
  const communityPath = notification.entityType === "community" && entityId
    ? `/comunidade/${entityId}`
    : "/comunidade";

  switch (notification.type) {
    case "friendship_request":
      return {
        title: "Nova solicitação de amizade",
        description: `${actorName} quer adicionar você como amizade.`,
        targetPath: profilePath(notification.actor),
      };
    case "friendship_accepted":
      return {
        title: "Solicitação aceita",
        description: `${actorName} aceitou sua solicitação de amizade.`,
        targetPath: profilePath(notification.actor),
      };
    case "friendship_declined":
      return {
        title: "Solicitação respondida",
        description: `${actorName} não aceitou sua solicitação de amizade.`,
        targetPath: "/perfil",
      };
    case "conversation_request":
      return {
        title: "Nova solicitação de conversa",
        description: `${actorName} quer iniciar uma conversa.`,
        targetPath: "/conversas?filtro=solicitacoes",
      };
    case "conversation_request_accepted":
    case "conversation_request_declined":
      return {
        title:
          notification.type === "conversation_request_accepted"
            ? "Conversa aceita"
            : "Solicitação respondida",
        description:
          notification.type === "conversation_request_accepted"
            ? `${actorName} aceitou sua solicitação de conversa.`
            : `${actorName} não aceitou sua solicitação de conversa.`,
        targetPath: "/conversas",
      };
    case "message_received":
    case "message_reaction":
      return {
        title: notification.type === "message_received" ? "Nova mensagem" : "Atualização na conversa",
        description: `Há uma atualização na sua conversa com ${actorName}.`,
        targetPath: conversationPath,
      };
    case "group_invitation":
      return {
        title: "Convite para grupo",
        description: `${actorName} convidou você para uma conversa em grupo.`,
        targetPath: conversationPath,
      };
    case "community_post":
    case "community_invite":
      return {
        title: notification.type === "community_invite" ? "Convite para comunidade" : "Nova publicação",
        description: "Há uma novidade em uma comunidade da qual você participa.",
        targetPath: communityPath,
      };
    case "post_comment":
    case "post_commented":
    case "comment_reply":
    case "comment_replied":
    case "post_reaction":
    case "content_reacted":
      return {
        title:
          notification.type === "post_reaction" || notification.type === "content_reacted"
            ? "Nova reação"
            : "Novo comentário",
        description: `${actorName} interagiu com uma publicação.`,
        targetPath: "/comunidade",
      };
    case "security_alert":
      return {
        title: "Alerta de segurança",
        description: "Confira uma atividade importante da sua conta.",
        targetPath: "/configuracoes/seguranca",
      };
    case "moderation_action":
    case "account_warning":
      return {
        title: "Atualização da conta",
        description: "Há uma informação importante sobre sua conta.",
        targetPath: "/configuracoes/conta",
      };
    case "account_role_changed":
      return {
        title: "Função da conta atualizada",
        description: "Sua função operacional na ORHA foi alterada por uma pessoa autorizada.",
        targetPath: "/configuracoes/conta",
      };
    case "support_ticket_reply":
    case "support_ticket_updated":
      return {
        title: notification.type === "support_ticket_reply"
          ? "Nova resposta do suporte"
          : "Chamado atualizado",
        description: "Confira o andamento do seu atendimento na ORHA.",
        targetPath: "/suporte",
      };
    default:
      return {
        title: "Novidade na ORHA",
        description: "Há uma nova atualização para você.",
        targetPath: "/notificacoes",
      };
  }
}

export type NotificationCursor = { createdAt: string; id: string };

export function encodeNotificationCursor(cursor: NotificationCursor): string {
  return `${cursor.createdAt}|${cursor.id}`;
}

export function decodeNotificationCursor(value: string): NotificationCursor | null {
  const separator = value.lastIndexOf("|");
  if (separator <= 0) return null;
  const createdAt = value.slice(0, separator);
  const id = value.slice(separator + 1);
  const timestamp = Date.parse(createdAt);
  if (
    Number.isNaN(timestamp)
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
  ) {
    return null;
  }
  return { createdAt: new Date(timestamp).toISOString(), id };
}
