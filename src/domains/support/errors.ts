export type SupportErrorKind =
  | "authentication"
  | "permission"
  | "validation"
  | "conflict"
  | "rate_limit"
  | "network"
  | "unavailable"
  | "unknown";

export class SupportError extends Error {
  constructor(
    public readonly kind: SupportErrorKind,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "SupportError";
  }
}
