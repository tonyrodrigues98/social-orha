import type { SocialPage } from "@/domains/social";

export const DEFAULT_SOCIAL_PAGE_SIZE = 20;
export const MAX_SOCIAL_PAGE_SIZE = 50;

export function normalizeSocialPageLimit(limit?: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_SOCIAL_PAGE_SIZE;
  return Math.min(
    MAX_SOCIAL_PAGE_SIZE,
    Math.max(1, Math.trunc(limit ?? DEFAULT_SOCIAL_PAGE_SIZE)),
  );
}

export function decodeSocialCursor(cursor?: string | null): number {
  if (!cursor) return 0;
  if (!/^[0-9a-z]+$/i.test(cursor)) return 0;
  const offset = Number.parseInt(cursor, 36);
  return Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
}

export function encodeSocialCursor(offset: number): string {
  return Math.max(0, Math.trunc(offset)).toString(36);
}

export function createSocialPage<Row, Item>(
  rows: Row[],
  offset: number,
  limit: number,
  map: (row: Row) => Item,
  continueWhenPageIsFull = false,
): SocialPage<Item> {
  const hasNextPage =
    rows.length > limit || (continueWhenPageIsFull && rows.length === limit);
  return {
    items: rows.slice(0, limit).map(map),
    nextCursor: hasNextPage ? encodeSocialCursor(offset + limit) : null,
  };
}
