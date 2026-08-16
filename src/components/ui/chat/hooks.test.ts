import { describe, expect, it } from "vitest";
import { formatDateLabel, formatTimestamp, groupMessages } from "./hooks";
import type { ChatMessageData } from "./types";

describe("chat date formatting", () => {
  it("uses Brazilian Portuguese labels and a 24-hour clock", () => {
    const date = new Date(2026, 7, 16, 14, 5);

    expect(formatTimestamp(date, "time-only")).toBe("14:05");
    expect(formatTimestamp(date, "absolute")).toBe("16/08/2026, 14:05");
    expect(formatDateLabel(date, "absolute")).toBe("16/08/2026");
    expect(formatDateLabel(new Date(), "relative")).toBe("Hoje");
  });

  it("propagates the configured date format to grouped separators", () => {
    const messages: ChatMessageData[] = [{
      id: "message-1",
      senderId: "contact-1",
      senderName: "Contato",
      text: "Olá",
      timestamp: new Date(2026, 7, 16, 14, 5),
    }];

    const grouped = groupMessages(messages, "current-user", 120, "absolute");
    expect(grouped[0]).toMatchObject({ type: "date", label: "16/08/2026" });
  });

  it("bounds very large sender groups so virtualized histories stay measurable", () => {
    const messages: ChatMessageData[] = Array.from({ length: 50 }, (_, index) => ({
      id: `message-${index}`,
      senderId: "contact-1",
      senderName: "Contato",
      text: `Mensagem ${index}`,
      timestamp: new Date(2026, 7, 16, 14, 5, index),
    }));

    const grouped = groupMessages(messages, "current-user");
    const messageGroups = grouped.filter((item) => item.type === "group");
    expect(messageGroups).toHaveLength(3);
  });
});
