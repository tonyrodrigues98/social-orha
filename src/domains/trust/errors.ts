export type TrustErrorCode =
  | "authentication"
  | "permission"
  | "validation"
  | "conflict"
  | "rate_limit"
  | "network"
  | "unavailable"
  | "unknown";

export class TrustError extends Error {
  constructor(
    public readonly code: TrustErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "TrustError";
  }
}
