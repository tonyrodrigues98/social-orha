export type AdministrationErrorCode =
  | "authentication"
  | "permission"
  | "validation"
  | "conflict"
  | "rate_limit"
  | "network"
  | "unavailable"
  | "unknown";

export class AdministrationError extends Error {
  readonly code: AdministrationErrorCode;

  constructor(code: AdministrationErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AdministrationError";
    this.code = code;
  }
}
