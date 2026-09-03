import { EdgeHttpError, bearerToken, requiredEnvironment } from "./runtime.ts";

export async function constantTimeEqual(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftHash);
  const rightBytes = new Uint8Array(rightHash);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < Math.max(leftBytes.length, rightBytes.length); index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

export async function requireCronAuthorization(request: Request): Promise<void> {
  const supplied = bearerToken(request);
  const expected = requiredEnvironment("ORHA_CRON_SECRET");
  if (!supplied || !(await constantTimeEqual(supplied, expected))) {
    throw new EdgeHttpError(401, "worker_authentication_required", "Autenticação do worker necessária.");
  }
}

