import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { installedPackageNames, libraryCatalog } from "../src/infrastructure/libraries/library-catalog";

const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as {
  dependencies?: Record<string, string>;
};

const dependencies = packageJson.dependencies ?? {};
const missingPackages = installedPackageNames.filter((packageName) => !(packageName in dependencies));
const missingSources = libraryCatalog
  .filter((entry) => entry.sourcePath && !existsSync(resolve(entry.sourcePath)))
  .map((entry) => `${entry.name}: ${entry.sourcePath}`);

if (missingPackages.length || missingSources.length) {
  console.error("Catálogo incompleto.");
  if (missingPackages.length) console.error(`Pacotes ausentes: ${missingPackages.join(", ")}`);
  if (missingSources.length) console.error(`Fontes ausentes: ${missingSources.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log(`${libraryCatalog.length} itens catalogados; ${installedPackageNames.length} pacotes e fontes locais conferidos.`);
}
