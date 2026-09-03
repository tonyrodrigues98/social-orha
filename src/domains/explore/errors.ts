export type ExploreErrorKind =
  | "authentication"
  | "permission"
  | "validation"
  | "network"
  | "unavailable"
  | "unknown";

export class ExploreError extends Error {
  readonly kind: ExploreErrorKind;

  constructor(kind: ExploreErrorKind, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ExploreError";
    this.kind = kind;
  }
}
