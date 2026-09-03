export type NotificationErrorCode =
  | "authentication"
  | "permission"
  | "validation"
  | "conflict"
  | "rate_limit"
  | "network"
  | "unavailable"
  | "unknown";

export class NotificationError extends Error {
  constructor(
    public readonly code: NotificationErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "NotificationError";
  }
}
