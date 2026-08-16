import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";

import {
  installedPackageNames,
  libraryCatalog,
  quarantinedPackageNames,
} from "../src/infrastructure/libraries/library-catalog";

const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as {
  dependencies?: Record<string, string>;
};

const dependencies = packageJson.dependencies ?? {};
const missingPackages = installedPackageNames.filter((packageName) => !(packageName in dependencies));
const missingSources = libraryCatalog.flatMap((entry) => {
  const paths = [...(entry.sourcePath ? [entry.sourcePath] : []), ...(entry.sourcePaths ?? [])];
  return paths.filter((path) => !existsSync(resolve(path))).map((path) => `${entry.name}: ${path}`);
});

const runtimeFiles = collectRuntimeFiles(resolve("src"));
const quarantineViolations = quarantinedPackageNames.flatMap((packageName) => {
  const escapedPackage = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const importPattern = new RegExp(
    `(?:from\\s*|import\\s*\\(?\\s*|require\\(\\s*)["']${escapedPackage}(?:/[^"']*)?["']`,
  );

  return runtimeFiles
    .filter((file) => !file.endsWith("library-catalog.ts"))
    .filter((file) => importPattern.test(readFileSync(file, "utf8")))
    .map((file) => `${packageName}: ${file}`);
});

if (missingPackages.length || missingSources.length || quarantineViolations.length) {
  console.error("Catálogo incompleto.");
  if (missingPackages.length) console.error(`Pacotes ausentes: ${missingPackages.join(", ")}`);
  if (missingSources.length) console.error(`Fontes ausentes: ${missingSources.join(", ")}`);
  if (quarantineViolations.length) {
    console.error(`Imports de pacotes em quarentena:\n${quarantineViolations.join("\n")}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `${libraryCatalog.length} itens catalogados; ${installedPackageNames.length} pacotes e fontes locais conferidos; `
      + `${quarantinedPackageNames.length} pacotes em quarentena sem imports de runtime.`,
  );
}

function collectRuntimeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectRuntimeFiles(path);
    return [".ts", ".tsx"].includes(extname(entry.name)) ? [path] : [];
  });
}
