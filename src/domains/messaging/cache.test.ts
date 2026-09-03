import { describe, expect, it } from "vitest";
import type { InfiniteData } from "@tanstack/react-query";
import { flattenMessagePages, mergeMessagePage } from "./cache";
import type { CursorPage, Message } from "./models";

function message(id: string, clientMessageId: string, createdAt: string, state: Message["deliveryState"] = "sent"): Message {
  return {
    id,
    clientMessageId,
    conversationId: "conversation-1",
    senderId: "user-1",
    senderName: "Pessoa",
    senderAvatarUrl: null,
    kind: "text",
    body: id,
    media: [],
    replyTo: null,
    forwardedFromMessageId: null,
    reactions: [],
    receipts: [],
    deliveryState: state,
    createdAt,
    editedAt: null,
    deletedAt: null,
  };
}

describe("messaging cache", () => {
  it("replaces the optimistic row by client_message_id without duplicating it", () => {
    const optimistic = message("optimistic:client-1", "client-1", "2026-08-16T12:00:00.000Z", "sending");
    const persisted = message("server-1", "client-1", "2026-08-16T12:00:01.000Z", "sent");
    const initial: InfiniteData<CursorPage<Message>> = {
      pages: [{ items: [optimistic], nextCursor: null }],
      pageParams: [null],
    };

    const result = mergeMessagePage(initial, persisted);
    expect(result.pages[0].items).toEqual([persisted]);
  });

  it("flattens older pages chronologically and removes realtime duplicates", () => {
    const older = message("older", "older-client", "2026-08-16T11:00:00.000Z");
    const newest = message("newest", "newest-client", "2026-08-16T12:00:00.000Z");
    const pages: CursorPage<Message>[] = [
      { items: [newest], nextCursor: { createdAt: older.createdAt, id: older.id } },
      { items: [older, newest], nextCursor: null },
    ];

    expect(flattenMessagePages(pages).map((item) => item.id)).toEqual(["older", "newest"]);
  });
});
