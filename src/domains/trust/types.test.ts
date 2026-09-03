import { describe, expect, it } from "vitest";
import {
  decodeTrustCursor,
  encodeTrustCursor,
  validateCreateReport,
  validateModerationAction,
} from "./types";

describe("trust domain", () => {
  it("normaliza detalhes e limita dados de denúncia", () => {
    const input = validateCreateReport({
      targetType: "profile",
      targetId: "10000000-0000-4000-8000-000000000001",
      category: "harassment",
      details: "  comportamento repetido  ",
    });
    expect(input.details).toBe("comportamento repetido");
  });

  it("exige motivo auditável em ação de moderação", () => {
    expect(() =>
      validateModerationAction({
        reportId: "10000000-0000-4000-8000-000000000001",
        actionType: "warn",
        reason: "curto",
      }),
    ).toThrow("pelo menos 10 caracteres");
  });

  it("mantém cursor determinístico", () => {
    const cursor = {
      createdAt: "2026-08-16T12:00:00.000Z",
      id: "10000000-0000-4000-8000-000000000001",
    };
    expect(decodeTrustCursor(encodeTrustCursor(cursor))).toEqual(cursor);
    expect(
      decodeTrustCursor('2026-08-16T12:00:00.000Z"|10000000-0000-4000-8000-000000000001'),
    ).toBeNull();
    expect(
      decodeTrustCursor("2026-08-16T12:00:00.000Z|------------------------------------"),
    ).toBeNull();
  });
});
