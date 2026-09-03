import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  productionDebtAllowlist,
  type ProductionDebtCategory,
} from "./production-debt-allowlist";

type DebtRule = {
  category: ProductionDebtCategory;
  pattern: RegExp;
};

export type ProductionDebtFinding = {
  category: ProductionDebtCategory;
  path: string;
  line: number;
  excerpt: string;
};

export type ProductionDebtViolation = {
  category: ProductionDebtCategory;
  path: string;
  count: number;
  allowed: number;
  lines: number[];
};

const RULES: readonly DebtRule[] = [
  { category: "prototype", pattern: /prototype/gi },
  { category: "mock", pattern: /mock/gi },
  { category: "seed", pattern: /seed/gi },
  { category: "todo", pattern: /\bTODO\b/gi },
  { category: "localStorage", pattern: /localStorage/g },
  { category: "createObjectURL", pattern: /createObjectURL/g },
];

const PRODUCTION_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".json",
  ".mjs",
  ".cjs",
  ".css",
  ".html",
]);

function listFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(absolute) : [absolute];
  });
}

function isProductionSource(file: string): boolean {
  const normalized = file.replaceAll("\\", "/");
  return (
    PRODUCTION_EXTENSIONS.has(path.extname(file)) &&
    !/\.(?:test|spec|stories)\.[^/]+$/i.test(normalized) &&
    !normalized.includes("/__tests__/")
  );
}

function lineNumberAt(source: string, index: number): number {
  return source.slice(0, index).split(/\r?\n/).length;
}

export function auditProductionDebt(workspaceRoot: string): {
  findings: ProductionDebtFinding[];
  violations: ProductionDebtViolation[];
} {
  const sourceRoot = path.join(workspaceRoot, "src");
  const findings: ProductionDebtFinding[] = [];

  for (const absolutePath of listFiles(sourceRoot).filter(isProductionSource)) {
    const source = readFileSync(absolutePath, "utf8");
    const relativePath = path
      .relative(workspaceRoot, absolutePath)
      .replaceAll("\\", "/");

    for (const rule of RULES) {
      const pattern = new RegExp(rule.pattern.source, rule.pattern.flags);
      for (const match of source.matchAll(pattern)) {
        const index = match.index ?? 0;
        const line = lineNumberAt(source, index);
        const excerpt = source.split(/\r?\n/)[line - 1]?.trim() ?? "";
        findings.push({
          category: rule.category,
          path: relativePath,
          line,
          excerpt: excerpt.slice(0, 180),
        });
      }
    }
  }

  const groups = new Map<string, ProductionDebtFinding[]>();
  for (const finding of findings) {
    const key = `${finding.category}\0${finding.path}`;
    const group = groups.get(key) ?? [];
    group.push(finding);
    groups.set(key, group);
  }

  const allowances = new Map<string, number>();
  for (const allowance of productionDebtAllowlist) {
    const key = `${allowance.category}\0${allowance.path}`;
    if (allowances.has(key)) {
      throw new Error(
        `Duplicate production-debt allowance: ${allowance.category} ${allowance.path}`,
      );
    }
    allowances.set(key, allowance.maxOccurrences);
  }

  const violations: ProductionDebtViolation[] = [];
  const auditedKeys = new Set([...groups.keys(), ...allowances.keys()]);
  for (const key of auditedKeys) {
    const group = groups.get(key) ?? [];
    const [category, relativePath] = key.split("\0") as [
      ProductionDebtCategory,
      string,
    ];
    const allowed = allowances.get(key) ?? 0;
    if (group.length !== allowed) {
      violations.push({
        category,
        path: relativePath,
        count: group.length,
        allowed,
        lines: group.map((finding) => finding.line),
      });
    }
  }

  return { findings, violations };
}

function printAudit(workspaceRoot: string): void {
  const { findings, violations } = auditProductionDebt(workspaceRoot);
  const totals = new Map<ProductionDebtCategory, number>();
  for (const finding of findings) {
    totals.set(finding.category, (totals.get(finding.category) ?? 0) + 1);
  }

  console.log("ORHA production-debt audit");
  for (const rule of RULES) {
    console.log(`- ${rule.category}: ${totals.get(rule.category) ?? 0}`);
  }

  if (violations.length === 0) {
    console.log("No production debt outside the explicit allowlist.");
    return;
  }

  console.error("Production debt does not match the explicit allowlist:");
  for (const violation of violations) {
    console.error(
      `- ${violation.category} ${violation.path}: ${violation.count} found, ${violation.allowed} declared (lines ${violation.lines.join(", ") || "none"})`,
    );
  }
  process.exitCode = 1;
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  printAudit(path.resolve("."));
}
