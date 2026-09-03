import type { InfiniteData } from "@tanstack/react-query";
import type { CursorPage, Message } from "./models";

function sameMessage(left: Message, right: Message) {
  return left.id === right.id || left.clientMessageId === right.clientMessageId;
}

export function mergeMessagePage(
  data: InfiniteData<CursorPage<Message>> | undefined,
  message: Message,
): InfiniteData<CursorPage<Message>> {
  if (!data?.pages.length) {
    return { pages: [{ items: [message], nextCursor: null }], pageParams: [null] };
  }

  let replaced = false;
  const pages = data.pages.map((page) => ({
    ...page,
    items: page.items.map((current) => {
      if (!sameMessage(current, message)) return current;
      replaced = true;
      return message;
    }),
  }));

  if (!replaced) {
    pages[0] = {
      ...pages[0],
      items: [...pages[0].items, message].sort((left, right) =>
        left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)),
    };
  }

  return { ...data, pages };
}

export function flattenMessagePages(pages: CursorPage<Message>[] | undefined): Message[] {
  const seen = new Set<string>();
  const messages: Message[] = [];
  for (const page of [...(pages ?? [])].reverse()) {
    for (const message of page.items) {
      const key = message.clientMessageId || message.id;
      if (seen.has(key)) continue;
      seen.add(key);
      messages.push(message);
    }
  }
  return messages.sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
}
