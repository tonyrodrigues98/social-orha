import path from "node:path";
import { fileURLToPath } from "node:url";

const USER_FUNCTIONS = ["account-export", "media-verify", "catalog-search"] as const;
const WORKER_FUNCTIONS = ["account-lifecycle-worker", "media-cleanup-worker"] as const;

export type EdgeSmokeFailure = {
  check: string;
  expected: string;
  actual: string;
};

export type EdgeSmokeResult = {
  checks: number;
  failures: EdgeSmokeFailure[];
};

type FetchLike = typeof fetch;

function normalizedFunctionsUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("ORHA_EDGE_FUNCTION_BASE_URL must be a credential-free HTTPS URL.");
  }
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/`;
  return url;
}

function normalizedOrigin(value: string): string {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol)
    || url.username
    || url.password
    || (url.pathname !== "/" && url.pathname !== "")
    || url.search
    || url.hash
  ) {
    throw new Error("ORHA_EDGE_ALLOWED_ORIGIN must be an HTTP(S) origin.");
  }
  return url.origin;
}

export async function runAnonymousEdgeFunctionSmoke({
  baseUrl,
  allowedOrigin,
  fetcher = fetch,
}: {
  baseUrl: string;
  allowedOrigin: string;
  fetcher?: FetchLike;
}): Promise<EdgeSmokeResult> {
  const base = normalizedFunctionsUrl(baseUrl);
  const allowed = normalizedOrigin(allowedOrigin);
  const failures: EdgeSmokeFailure[] = [];
  let checks = 0;

  await Promise.all([...USER_FUNCTIONS, ...WORKER_FUNCTIONS].map(async (name) => {
    const response = await fetcher(new URL(name, base), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(15_000),
    });
    checks += 1;
    if (response.status !== 401) {
      failures.push({ check: `${name}:anonymous`, expected: "401", actual: String(response.status) });
    }
  }));

  const allowedResponse = await fetcher(new URL("catalog-search", base), {
    method: "OPTIONS",
    headers: { origin: allowed, "access-control-request-method": "POST" },
    signal: AbortSignal.timeout(15_000),
  });
  checks += 1;
  const returnedOrigin = allowedResponse.headers.get("access-control-allow-origin");
  if (allowedResponse.status !== 204 || returnedOrigin !== allowed) {
    failures.push({
      check: "cors:allowed-origin",
      expected: `204 with ${allowed}`,
      actual: `${allowedResponse.status} with ${returnedOrigin ?? "no origin"}`,
    });
  }

  const deniedOrigin = "https://orha-invalid-origin.example";
  const deniedResponse = await fetcher(new URL("catalog-search", base), {
    method: "OPTIONS",
    headers: { origin: deniedOrigin, "access-control-request-method": "POST" },
    signal: AbortSignal.timeout(15_000),
  });
  checks += 1;
  if (deniedResponse.status !== 403 || deniedResponse.headers.has("access-control-allow-origin")) {
    failures.push({
      check: "cors:denied-origin",
      expected: "403 without access-control-allow-origin",
      actual: `${deniedResponse.status} with ${deniedResponse.headers.get("access-control-allow-origin") ?? "no origin"}`,
    });
  }

  return { checks, failures };
}

async function main(): Promise<void> {
  const baseUrl = process.env.ORHA_EDGE_FUNCTION_BASE_URL?.trim();
  const allowedOrigin = process.env.ORHA_EDGE_ALLOWED_ORIGIN?.trim();
  if (!baseUrl || !allowedOrigin) {
    throw new Error(
      "Set ORHA_EDGE_FUNCTION_BASE_URL and ORHA_EDGE_ALLOWED_ORIGIN before running the remote smoke.",
    );
  }

  const result = await runAnonymousEdgeFunctionSmoke({ baseUrl, allowedOrigin });
  console.log(`ORHA Edge Functions anonymous smoke: ${result.checks - result.failures.length}/${result.checks} passed.`);
  for (const failure of result.failures) {
    console.error(`- ${failure.check}: expected ${failure.expected}; received ${failure.actual}`);
  }
  if (result.failures.length > 0) process.exitCode = 1;
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Edge Function smoke failed.");
    process.exitCode = 1;
  });
}
