import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

export type BundleBudgets = {
  initialJsRaw: number;
  initialJsGzip: number;
  initialCssRaw: number;
  initialCssGzip: number;
  largestLazyJsRaw: number;
  largestLazyJsGzip: number;
};

export type BundleAssetMetric = {
  path: string;
  raw: number;
  gzip: number;
};

export type BundleBudgetReport = {
  initialJs: BundleAssetMetric[];
  initialCss: BundleAssetMetric[];
  lazyJs: BundleAssetMetric[];
  totals: BundleBudgets;
  violations: string[];
};

// Baseline measured on the production build from 2026-09-14, with controlled
// headroom for hash/minifier variation. Raising a limit requires an explicit
// performance decision rather than allowing silent bundle growth.
export const DEFAULT_BUNDLE_BUDGETS: BundleBudgets = {
  initialJsRaw: 1_100 * 1024,
  initialJsGzip: 340 * 1024,
  initialCssRaw: 180 * 1024,
  initialCssGzip: 36 * 1024,
  largestLazyJsRaw: 320 * 1024,
  largestLazyJsGzip: 100 * 1024,
};

function referencedCodeAssets(indexHtml: string): string[] {
  const references = Array.from(
    indexHtml.matchAll(/<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+\.(?:js|css))(?:\?[^"']*)?["'][^>]*>/gi),
    (match) => match[1],
  );

  return [...new Set(references.map((reference) => {
    const pathname = decodeURIComponent(new URL(reference, "https://orha.invalid/").pathname);
    const segments = pathname.split("/").filter(Boolean);
    const assetsIndex = segments.lastIndexOf("assets");
    return (assetsIndex >= 0 ? segments.slice(assetsIndex) : segments.slice(-1)).join("/");
  }))];
}

function safeAssetPath(distDirectory: string, relativePath: string): string {
  const root = resolve(distDirectory);
  const assetPath = resolve(root, relativePath);
  if (assetPath !== root && !assetPath.startsWith(`${root}${sep}`)) {
    throw new Error(`Bundle asset escaped dist: ${relativePath}`);
  }
  if (!existsSync(assetPath)) throw new Error(`Referenced bundle asset is missing: ${relativePath}`);
  return assetPath;
}

function metricFor(distDirectory: string, relativePath: string): BundleAssetMetric {
  const contents = readFileSync(safeAssetPath(distDirectory, relativePath));
  return {
    path: relativePath.replaceAll("\\", "/"),
    raw: contents.byteLength,
    gzip: gzipSync(contents, { level: 9 }).byteLength,
  };
}

function total(metrics: BundleAssetMetric[], property: "raw" | "gzip"): number {
  return metrics.reduce((sum, metric) => sum + metric[property], 0);
}

function largest(metrics: BundleAssetMetric[], property: "raw" | "gzip"): number {
  return metrics.reduce((maximum, metric) => Math.max(maximum, metric[property]), 0);
}

function evaluate(name: keyof BundleBudgets, actual: number, budget: number): string | null {
  if (actual <= budget) return null;
  return `${name}: ${formatBytes(actual)} exceeds ${formatBytes(budget)}`;
}

export function inspectBundleBudget({
  distDirectory = "dist",
  budgets = DEFAULT_BUNDLE_BUDGETS,
}: {
  distDirectory?: string;
  budgets?: BundleBudgets;
} = {}): BundleBudgetReport {
  const indexPath = safeAssetPath(distDirectory, "index.html");
  const initialReferences = referencedCodeAssets(readFileSync(indexPath, "utf8"));
  const initialMetrics = initialReferences.map((reference) => metricFor(distDirectory, reference));
  const initialJs = initialMetrics.filter((metric) => metric.path.endsWith(".js"));
  const initialCss = initialMetrics.filter((metric) => metric.path.endsWith(".css"));
  const initialSet = new Set(initialReferences);
  const assetsDirectory = safeAssetPath(distDirectory, "assets");
  const lazyJs = readdirSync(assetsDirectory, { recursive: true })
    .map(String)
    .filter((asset) => asset.endsWith(".js"))
    .map((asset) => `assets/${asset.replaceAll("\\", "/")}`)
    .filter((asset) => !initialSet.has(asset))
    .map((asset) => metricFor(distDirectory, asset))
    .sort((left, right) => right.raw - left.raw);

  const totals: BundleBudgets = {
    initialJsRaw: total(initialJs, "raw"),
    initialJsGzip: total(initialJs, "gzip"),
    initialCssRaw: total(initialCss, "raw"),
    initialCssGzip: total(initialCss, "gzip"),
    largestLazyJsRaw: largest(lazyJs, "raw"),
    largestLazyJsGzip: largest(lazyJs, "gzip"),
  };
  const violations = (Object.keys(budgets) as Array<keyof BundleBudgets>)
    .map((name) => evaluate(name, totals[name], budgets[name]))
    .filter((violation): violation is string => Boolean(violation));

  return { initialJs, initialCss, lazyJs, totals, violations };
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

function main(): void {
  const report = inspectBundleBudget();
  console.log("ORHA bundle budget");
  console.log(`- initial JS: ${formatBytes(report.totals.initialJsRaw)} raw / ${formatBytes(report.totals.initialJsGzip)} gzip`);
  console.log(`- initial CSS: ${formatBytes(report.totals.initialCssRaw)} raw / ${formatBytes(report.totals.initialCssGzip)} gzip`);
  console.log(`- largest lazy JS: ${formatBytes(report.totals.largestLazyJsRaw)} raw / ${formatBytes(report.totals.largestLazyJsGzip)} gzip`);
  if (report.lazyJs[0]) console.log(`- largest lazy asset: ${report.lazyJs[0].path}`);
  if (report.violations.length > 0) {
    for (const violation of report.violations) console.error(`FAIL ${violation}`);
    process.exitCode = 1;
  } else {
    console.log("All bundle budgets passed.");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
