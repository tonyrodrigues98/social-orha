import {
  readdirSync,
  readFileSync,
  type Dirent,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { extname, relative, resolve } from "node:path";

const textExtensions = new Set([
  ".css",
  ".cjs",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".ps1",
  ".scss",
  ".sql",
  ".svg",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
]);

const textFileNames = new Set([
  ".gitattributes",
  ".gitignore",
  ".npmrc",
  "CNAME",
  "Dockerfile",
]);

export function isAuditedTextFileName(name: string): boolean {
  return textFileNames.has(name)
    || /^\.env(?:\.[a-z0-9_-]+)*\.example$/iu.test(name)
    || textExtensions.has(extname(name).toLowerCase());
}

const excludedDirectories = new Set([
  ".git",
  ".npm-cache",
  ".tmp",
  ".tmp-build",
  ".tmp-chat-build",
  ".tmp-final-build",
  ".tmp-pwa-build",
  ".tmp-pwa-pages-build",
  "blob-report",
  "dist",
  "node_modules",
  "playwright-report",
  "test-results",
]);

const suspiciousPatterns: ReadonlyArray<{ label: string; expression: RegExp }> = [
  {
    label: "UTF-8 lido como Latin-1",
    expression: /\u00c3(?:[\u0080-\u00bf]|\u0192|\u201a)/gu,
  },
  {
    label: "marcador Latin-1 residual",
    expression: /\u00c2(?:[\u0080-\u00bf]|\u00a0)/gu,
  },
  {
    label: "pontuação UTF-8 corrompida",
    expression: /\u00e2(?:\u20ac|\u2020|\u2021)/gu,
  },
  {
    label: "caractere de substituição Unicode",
    expression: /\ufffd/gu,
  },
  {
    label: "caractere de substituição duplamente codificado",
    expression: /\u00ef\u00bf\u00bd/gu,
  },
  {
    label: "emoji UTF-8 corrompido",
    expression: /\u00f0(?:\u0178|\u00bf)/gu,
  },
];

export type TextEncodingIssue = {
  path: string;
  line: number;
  column: number;
  sequence: string;
  label: string;
};

function collectTextFiles(directory: string, output: string[]): void {
  let entries: Dirent[];
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const absolutePath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (!excludedDirectories.has(entry.name)) collectTextFiles(absolutePath, output);
      continue;
    }
    if (entry.isFile() && isAuditedTextFileName(entry.name)) {
      output.push(absolutePath);
    }
  }
}

function locate(source: string, offset: number): { line: number; column: number } {
  const prefix = source.slice(0, offset);
  const lines = prefix.split("\n");
  return {
    line: lines.length,
    column: (lines.at(-1)?.length ?? 0) + 1,
  };
}

export function findTextEncodingIssues(projectRoot = process.cwd()): TextEncodingIssue[] {
  const root = resolve(projectRoot);
  const files: string[] = [];
  collectTextFiles(root, files);
  const issues: TextEncodingIssue[] = [];

  for (const absolutePath of files.sort()) {
    const source = readFileSync(absolutePath, "utf8");
    for (const pattern of suspiciousPatterns) {
      pattern.expression.lastIndex = 0;
      for (const match of source.matchAll(pattern.expression)) {
        if (match.index === undefined) continue;
        const position = locate(source, match.index);
        issues.push({
          path: relative(root, absolutePath).replaceAll("\\", "/"),
          line: position.line,
          column: position.column,
          sequence: match[0],
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

export function formatTextEncodingAudit(issues: readonly TextEncodingIssue[]): string {
  if (issues.length === 0) return "Nenhuma sequência suspeita de mojibake encontrada.";
  return issues
    .map((issue) => `${issue.path}:${issue.line}:${issue.column} [${issue.label}] ${JSON.stringify(issue.sequence)}`)
    .join("\n");
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const issues = findTextEncodingIssues();
  console.log(formatTextEncodingAudit(issues));
  if (issues.length > 0) process.exitCode = 1;
}
