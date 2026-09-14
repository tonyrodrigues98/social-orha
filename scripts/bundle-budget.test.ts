import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { inspectBundleBudget, type BundleBudgets } from "./bundle-budget";

const temporaryDirectories: string[] = [];

function fixture(): string {
  const directory = mkdtempSync(join(tmpdir(), "orha-bundle-budget-"));
  temporaryDirectories.push(directory);
  mkdirSync(join(directory, "assets"));
  writeFileSync(join(directory, "index.html"), [
    '<script type="module" src="/social-orha/assets/main.js"></script>',
    '<link rel="modulepreload" href="/social-orha/assets/vendor.js">',
    '<link rel="stylesheet" href="/social-orha/assets/main.css">',
  ].join("\n"));
  writeFileSync(join(directory, "assets/main.js"), "m".repeat(120));
  writeFileSync(join(directory, "assets/vendor.js"), "v".repeat(80));
  writeFileSync(join(directory, "assets/lazy.js"), "l".repeat(160));
  writeFileSync(join(directory, "assets/main.css"), "c".repeat(60));
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("bundle budget", () => {
  it("measures only HTML-linked assets as initial and keeps lazy chunks separate", () => {
    const report = inspectBundleBudget({ distDirectory: fixture() });

    expect(report.initialJs.map((asset) => asset.path)).toEqual([
      "assets/main.js",
      "assets/vendor.js",
    ]);
    expect(report.initialCss.map((asset) => asset.path)).toEqual(["assets/main.css"]);
    expect(report.lazyJs.map((asset) => asset.path)).toEqual(["assets/lazy.js"]);
    expect(report.totals.initialJsRaw).toBe(200);
    expect(report.totals.initialCssRaw).toBe(60);
    expect(report.totals.largestLazyJsRaw).toBe(160);
  });

  it("reports every exceeded limit without changing the artifact", () => {
    const budgets: BundleBudgets = {
      initialJsRaw: 199,
      initialJsGzip: 1,
      initialCssRaw: 59,
      initialCssGzip: 1,
      largestLazyJsRaw: 159,
      largestLazyJsGzip: 1,
    };
    const report = inspectBundleBudget({ distDirectory: fixture(), budgets });

    expect(report.violations).toHaveLength(6);
    expect(report.violations[0]).toContain("initialJsRaw");
    expect(report.violations.at(-1)).toContain("largestLazyJsGzip");
  });
});
