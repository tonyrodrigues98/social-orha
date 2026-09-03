import path from "node:path";
import { describe, expect, it } from "vitest";
import { auditProductionDebt } from "./audit-production-debt";

describe("production debt allowlist", () => {
  it("matches the exact reviewed Prototype/mock/seed/TODO/storage/blob baseline", () => {
    const result = auditProductionDebt(path.resolve("."));
    expect(result.violations).toEqual([]);
  });
});
