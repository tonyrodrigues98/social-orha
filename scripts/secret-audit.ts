import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { basename, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { isAuditedTextFileName } from "./text-encoding-audit";

const maximumAuditedFileBytes = 5 * 1024 * 1024;

const secretPatterns: ReadonlyArray<{
  label: string;
  expression: RegExp;
  excludeTestFixtures?: boolean;
}> = [
  {
    label: "Supabase secret key",
    expression: /\bsb_secret_[a-z0-9_-]{16,}\b/giu,
  },
  {
    label: "JWT versionável",
    expression: /\beyJ[a-z0-9_-]{16,}\.[a-z0-9_-]{16,}\.[a-z0-9_-]{10,}\b/giu,
  },
  {
    label: "URI PostgreSQL com credencial",
    expression: /\bpostgres(?:ql)?:\/\/[^:\s/@]+:[^@\s/]+@/giu,
  },
  {
    label: "chave privada",
    expression: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gu,
  },
  {
    label: "token GitHub",
    expression: /\bgh[pousr]_[a-z0-9]{30,}\b/giu,
  },
  {
    label: "secret de provedor",
    expression: /\b(?:GOCSPX-|sk-(?:proj-)?)[a-z0-9_-]{20,}\b/giu,
  },
  {
    label: "credencial literal",
    expression: /\b(?:password|passwd|client_secret|service_role_key)\s*[:=]\s*["']([^"'${}\r\n]{8,})["']/giu,
    excludeTestFixtures: true,
  },
  {
    label: "secret privilegiado exposto ao Vite",
    expression: /^\s*VITE_[A-Z0-9_]*(?:SERVICE_ROLE|SECRET|PRIVATE_KEY|DATABASE_PASSWORD)[A-Z0-9_]*\s*[:=]\s*["']?[^\s"'#]+/gmu,
  },
];

const safePlaceholder = /(?:placeholder|example|changeme|your[-_]|test-only|<[^>]+>)/iu;

export type SecretAuditIssue = {
  path: string;
  line: number;
  column: number;
  label: string;
};

function locate(source: string, offset: number): { line: number; column: number } {
  const prefix = source.slice(0, offset);
  const lines = prefix.split("\n");
  return {
    line: lines.length,
    column: (lines.at(-1)?.length ?? 0) + 1,
  };
}

function listVersionableFiles(projectRoot: string): string[] {
  const output = execFileSync(
    "git",
    ["-C", projectRoot, "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { encoding: "utf8" },
  );
  return output.split("\0").filter(Boolean);
}

export function findSecretIssuesInFiles(
  projectRoot: string,
  paths: readonly string[],
): SecretAuditIssue[] {
  const root = resolve(projectRoot);
  const issues: SecretAuditIssue[] = [];

  for (const path of [...paths].sort()) {
    if (!isAuditedTextFileName(basename(path))) continue;
    const absolutePath = resolve(root, path);
    const localPath = relative(root, absolutePath);
    if (localPath.startsWith("..") || !existsSync(absolutePath)) continue;
    const fileStats = lstatSync(absolutePath);
    if (!fileStats.isFile() || fileStats.size > maximumAuditedFileBytes) continue;
    const source = readFileSync(absolutePath, "utf8");

    for (const pattern of secretPatterns) {
      if (pattern.excludeTestFixtures && /\.(?:test|spec)\.[cm]?[jt]sx?$/iu.test(path)) continue;
      pattern.expression.lastIndex = 0;
      for (const match of source.matchAll(pattern.expression)) {
        if (
          match.index === undefined
          || safePlaceholder.test(match[0])
          || (match[1] !== undefined && /^[A-Z][A-Z0-9_]+$/u.test(match[1]))
        ) continue;
        const position = locate(source, match.index);
        issues.push({
          path: localPath.replaceAll("\\", "/"),
          line: position.line,
          column: position.column,
          label: pattern.label,
        });
      }
    }
  }

  return issues.sort((left, right) =>
    left.path.localeCompare(right.path)
      || left.line - right.line
      || left.column - right.column,
  );
}

export function findVersionableSecretIssues(projectRoot = process.cwd()): SecretAuditIssue[] {
  const root = resolve(projectRoot);
  return findSecretIssuesInFiles(root, listVersionableFiles(root));
}

export function formatSecretAudit(issues: readonly SecretAuditIssue[]): string {
  if (issues.length === 0) {
    return "Nenhum secret versionável encontrado; sb_publishable é chave pública e não é classificada como secret.";
  }
  return issues
    .map((issue) => `${issue.path}:${issue.line}:${issue.column} [${issue.label}] valor omitido`)
    .join("\n");
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const issues = findVersionableSecretIssues();
  console.log(formatSecretAudit(issues));
  if (issues.length > 0) process.exitCode = 1;
}
