import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  SupabaseNotificationRepository,
  mapNotificationRow,
  mapPreferenceRow,
} from "./notification-repository";

describe("SupabaseNotificationRepository mapping", () => {
  it("não expõe payload e normaliza ator", () => {
    const notification = mapNotificationRow({
      id: "10000000-0000-4000-8000-000000000001",
      recipient_id: "10000000-0000-4000-8000-000000000002",
      actor_id: "10000000-0000-4000-8000-000000000003",
      actor: { id: "10000000-0000-4000-8000-000000000003", full_name: "Ana", username: "ana", avatar_path: null },
      type: "message_received",
      entity_type: "conversation",
      entity_id: "10000000-0000-4000-8000-000000000004",
      created_at: "2026-08-16T10:00:00.000Z",
      read_at: null,
    });
    expect(notification.category).toBe("messages");
    expect(notification.actor?.username).toBe("ana");
    expect(notification).not.toHaveProperty("payload");
  });

  it("mapeia preferências do schema sem defaults locais", () => {
    expect(
      mapPreferenceRow({
        profile_id: "10000000-0000-4000-8000-000000000001",
        social_enabled: true,
        messages_enabled: true,
        community_enabled: false,
        system_enabled: true,
        email_enabled: false,
        push_enabled: false,
        quiet_hours_start: null,
        quiet_hours_end: null,
        updated_at: "2026-08-16T10:00:00.000Z",
      }).communityEnabled,
    ).toBe(false);
  });

  it("usa o cliente injetado e a RPC atômica para leitura", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const repository = new SupabaseNotificationRepository({ rpc } as unknown as SupabaseClient);
    await repository.markRead(["10000000-0000-4000-8000-000000000001"]);
    expect(rpc).toHaveBeenCalledWith("mark_notifications_read", {
      p_notification_ids: ["10000000-0000-4000-8000-000000000001"],
    });
  });
});
