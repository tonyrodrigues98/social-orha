import { pathToFileURL } from "node:url";

export const DEFAULT_DEEP_LINK_PATHS = [
  "/auth/login",
  "/reset-password",
  "/perfil/orha-host-gate",
] as const;

export type HostCapabilityResult = {
  url: string;
  status: number;
  contentType: string;
  servesAppShell: boolean;
};

export type HostCapabilityAudit = {
  baseUrl: string;
  root: HostCapabilityResult;
  deepLinks: HostCapabilityResult[];
  rewriteCapable: boolean;
};

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Pick<Response, "status" | "headers">>;

function normalizeHostBase(configuredUrl: string): URL {
  const url = new URL(configuredUrl);
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Error("ORHA_HOST_URL deve usar HTTPS fora de localhost.");
  }
  url.search = "";
  url.hash = "";
  if (!url.pathname.endsWith("/")) url.pathname = `${url.pathname}/`;
  return url;
}

function deepLinkUrl(base: URL, appPath: string): URL {
  const relative = appPath.replace(/^\/+/, "");
  return new URL(`${base.pathname}${relative}`, base.origin);
}

async function inspectUrl(fetcher: FetchLike, url: URL): Promise<HostCapabilityResult> {
  const response = await fetcher(url, {
    method: "GET",
    redirect: "manual",
    headers: { accept: "text/html" },
  });
  const contentType = response.headers.get("content-type") ?? "";
  return {
    url: url.toString(),
    status: response.status,
    contentType,
    servesAppShell: response.status === 200 && /text\/html/i.test(contentType),
  };
}

export async function auditHostCapabilities({
  hostUrl,
  deepLinks = DEFAULT_DEEP_LINK_PATHS,
  fetcher = fetch,
}: {
  hostUrl: string;
  deepLinks?: readonly string[];
  fetcher?: FetchLike;
}): Promise<HostCapabilityAudit> {
  const base = normalizeHostBase(hostUrl);
  const root = await inspectUrl(fetcher, base);
  const results = await Promise.all(
    deepLinks.map((path) => inspectUrl(fetcher, deepLinkUrl(base, path))),
  );
  return {
    baseUrl: base.toString(),
    root,
    deepLinks: results,
    rewriteCapable: root.servesAppShell && results.every((result) => result.servesAppShell),
  };
}

function printResult(result: HostCapabilityResult): void {
  const verdict = result.servesAppShell ? "PASS" : "FAIL";
  console.log(`${verdict} ${result.status} ${result.url} (${result.contentType || "sem content-type"})`);
}

async function main(): Promise<void> {
  const hostUrl = process.env.ORHA_HOST_URL?.trim();
  if (!hostUrl) {
    console.error("ORHA_HOST_URL é obrigatório para auditar o fallback de rotas do host.");
    process.exitCode = 2;
    return;
  }
  const audit = await auditHostCapabilities({ hostUrl });
  printResult(audit.root);
  for (const result of audit.deepLinks) printResult(result);
  if (!audit.rewriteCapable) {
    console.error(
      "HOST_GATE_FAILED: o host não devolve o app shell com HTTP 200 em todos os deep links; um redirecionamento executado dentro de 404.html não satisfaz este gate.",
    );
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

