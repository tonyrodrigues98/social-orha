import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  LEGAL_PUBLIC_ENV_KEYS,
  legalPublicConfigurationFromEnvironment,
  type LegalPublicEnvironment,
} from "../src/config/legal-public-configuration";

export function launchConfigurationIssues(
  environment: NodeJS.ProcessEnv,
): string[] {
  const publicEnvironment = Object.fromEntries(
    LEGAL_PUBLIC_ENV_KEYS.map((key) => [key, environment[key]]),
  ) as LegalPublicEnvironment;
  const configuration =
    legalPublicConfigurationFromEnvironment(publicEnvironment);

  return configuration.missingKeys.map((key) =>
    environment[key]?.trim() ? `invalid:${key}` : `missing:${key}`,
  );
}

function run(): void {
  const issues = launchConfigurationIssues(process.env);
  if (issues.length > 0) {
    console.error(
      `Public launch configuration is incomplete. Issues: ${issues.join(", ")}`,
    );
    process.exitCode = 1;
    return;
  }
  console.log("Public legal, privacy and support launch configuration passed.");
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) run();
