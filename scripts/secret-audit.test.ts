import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { findSecretIssuesInFiles, formatSecretAudit } from "./secret-audit";

describe("versionable secret audit", () => {
  it("allows a Supabase publishable key and empty secret placeholders", () => {
    const root = mkdtempSync(join(tmpdir(), "orha-secret-audit-safe-"));
    try {
      const path = ".env.example";
      writeFileSync(
        join(root, path),
        [
          `VITE_SUPABASE_PUBLISHABLE_KEY=${["sb", "publishable", "public-test-value"].join("_")}`,
          "SUPABASE_SERVICE_ROLE_KEY=",
        ].join("\n"),
        "utf8",
      );
      expect(findSecretIssuesInFiles(root, [path])).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("finds a versionable secret without returning its value", () => {
    const root = mkdtempSync(join(tmpdir(), "orha-secret-audit-unsafe-"));
    try {
      mkdirSync(join(root, "config"));
      const path = "config/runtime.ts";
      const secret = ["sb", "secret", "this-value-must-never-be-printed"].join("_");
      writeFileSync(join(root, path), `export const credential = "${secret}";\n`, "utf8");
      const issues = findSecretIssuesInFiles(root, [path]);
      expect(issues).toMatchObject([{ path, line: 1, label: "Supabase secret key" }]);
      expect(JSON.stringify(issues)).not.toContain(secret);
      expect(formatSecretAudit(issues)).toBe(
        "config/runtime.ts:1:28 [Supabase secret key] valor omitido",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
