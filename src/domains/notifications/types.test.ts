import { describe, expect, it } from "vitest";
import {
  categoryForNotificationType,
  decodeNotificationCursor,
  encodeNotificationCursor,
  presentNotification,
  type Notification,
} from "./types";

const notification: Notification = {
  id: "10000000-0000-4000-8000-000000000001",
  recipientId: "10000000-0000-4000-8000-000000000002",
  actorId: "10000000-0000-4000-8000-000000000003",
  actor: {
    id: "10000000-0000-4000-8000-000000000003",
    fullName: "Ana Clara",
    username: "ana.clara",
    avatarPath: null,
  },
  type: "friendship_request",
  category: "social",
  entityType: "profile",
  entityId: "10000000-0000-4000-8000-000000000003",
  createdAt: "2026-08-16T15:20:00.000Z",
  readAt: null,
};

describe("notification domain", () => {
  it("classifica tipos sem depender do payload do banco", () => {
    expect(categoryForNotificationType("friendship_request")).toBe("social");
    expect(categoryForNotificationType("post_commented")).toBe("social");
    expect(categoryForNotificationType("content_reacted")).toBe("social");
    expect(categoryForNotificationType("message_received")).toBe("messages");
    expect(categoryForNotificationType("group_invitation")).toBe("messages");
    expect(categoryForNotificationType("security_alert")).toBe("important");
    expect(categoryForNotificationType("support_ticket_reply")).toBe("important");
    expect(categoryForNotificationType("maintenance")).toBe("system");
  });

  it("não trata o id de uma mensagem como id de conversa no deep link", () => {
    expect(
      presentNotification({
        ...notification,
        type: "message_received",
        entityType: "message",
      }).targetPath,
    ).toBe("/conversas");
    expect(
      presentNotification({
        ...notification,
        type: "message_received",
        entityType: "conversation",
      }).targetPath,
    ).toBe(`/conversas/${notification.entityId}`);
  });

  it("cria deep link somente a partir de entidades conhecidas", () => {
    expect(presentNotification(notification)).toEqual({
      title: "Nova solicitação de amizade",
      description: "Ana Clara quer adicionar você como amizade.",
      targetPath: "/perfil/ana.clara",
    });
  });

  it("mantém avisos de comunidade e segurança em rotas registradas", () => {
    expect(
      presentNotification({
        ...notification,
        type: "community_invite",
        entityType: "community",
      }).targetPath,
    ).toBe(`/comunidade/${notification.entityId}`);
    expect(
      presentNotification({
        ...notification,
        type: "community_post",
        entityType: "community_post",
      }).targetPath,
    ).toBe("/comunidade");
    expect(
      presentNotification({
        ...notification,
        type: "security_alert",
        entityType: "account",
      }).targetPath,
    ).toBe("/configuracoes/seguranca");
    expect(
      presentNotification({
        ...notification,
        type: "support_ticket_reply",
        entityType: "support_ticket",
      }),
    ).toMatchObject({
      title: "Nova resposta do suporte",
      targetPath: "/suporte",
    });
  });

  it("mantém cursor determinístico por data e id", () => {
    const cursor = { createdAt: notification.createdAt, id: notification.id };
    expect(decodeNotificationCursor(encodeNotificationCursor(cursor))).toEqual(cursor);
    expect(decodeNotificationCursor("inválido")).toBeNull();
    expect(
      decodeNotificationCursor('2026-08-16T15:20:00.000Z"|10000000-0000-4000-8000-000000000001'),
    ).toBeNull();
    expect(
      decodeNotificationCursor("2026-08-16T15:20:00.000Z|------------------------------------"),
    ).toBeNull();
  });
});
