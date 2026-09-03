import { rm } from "node:fs/promises";
import path from "node:path";
import { AUTH_STATE_DIRECTORY } from "./support/environment";

export default async function removeEphemeralAuthState(): Promise<void> {
  const parent = path.dirname(AUTH_STATE_DIRECTORY);
  if (
    path.basename(AUTH_STATE_DIRECTORY) !== ".auth" ||
    path.basename(parent) !== "playwright"
  ) {
    throw new Error("Recusando remover um diretório de sessão E2E inesperado.");
  }

  await rm(AUTH_STATE_DIRECTORY, { recursive: true, force: true });
}
