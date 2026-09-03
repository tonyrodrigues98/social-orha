import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  findTextEncodingIssues,
  formatTextEncodingAudit,
} from "./text-encoding-audit";

describe("UTF-8 text integrity", () => {
  it("keeps runtime, migrations, scripts and documentation free of mojibake", () => {
    const issues = findTextEncodingIssues();
    expect(formatTextEncodingAudit(issues)).toBe(
      "Nenhuma sequência suspeita de mojibake encontrada.",
    );
  }, 15_000);

  it("includes versionable environment examples in the scan", () => {
    const root = mkdtempSync(join(tmpdir(), "orha-encoding-audit-"));
    try {
      writeFileSync(join(root, ".env.e2e.example"), `LABEL=N${"\u00c3\u00a3"}o\n`, "utf8");
      expect(findTextEncodingIssues(root)).toMatchObject([
        {
          path: ".env.e2e.example",
          line: 1,
          sequence: "\u00c3\u00a3",
        },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
