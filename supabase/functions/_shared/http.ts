import { EdgeHttpError, optionalEnvironment } from "./runtime.ts";

const baseHeaders = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
} as const;

function allowedOrigins(): Set<string> {
  return new Set(
    (optionalEnvironment("ORHA_ALLOWED_ORIGINS") ?? "")
      .split(",")
      .map((origin) => origin.trim().replace(/\/$/, ""))
      .filter(Boolean),
  );
}

export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin")?.replace(/\/$/, "") ?? null;
  if (!origin) return {};
  if (!allowedOrigins().has(origin)) {
    throw new EdgeHttpError(403, "origin_not_allowed", "Origem não autorizada.");
  }
  return {
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

export function optionsResponse(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export function jsonResponse(
  request: Request,
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...baseHeaders, ...corsHeaders(request), ...extraHeaders },
  });
}

export function errorResponse(request: Request, cause: unknown): Response {
  if (cause instanceof EdgeHttpError) {
    if (cause.code === "origin_not_allowed") {
      return new Response(JSON.stringify({ error: { code: cause.code, message: cause.message } }), {
        status: cause.status,
        headers: baseHeaders,
      });
    }
    return jsonResponse(request, { error: { code: cause.code, message: cause.message } }, cause.status);
  }
  return jsonResponse(
    request,
    { error: { code: "operation_failed", message: "Não foi possível concluir a operação." } },
    500,
  );
}

export async function parseJsonObject(request: Request, maximumBytes = 16_384): Promise<Record<string, unknown>> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new EdgeHttpError(413, "request_too_large", "A solicitação excede o limite permitido.");
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maximumBytes) {
    throw new EdgeHttpError(413, "request_too_large", "A solicitação excede o limite permitido.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new EdgeHttpError(400, "invalid_json", "Envie um corpo JSON válido.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new EdgeHttpError(400, "invalid_request", "A solicitação é inválida.");
  }
  return parsed as Record<string, unknown>;
}

export function assertPost(request: Request): void {
  if (request.method !== "POST") {
    throw new EdgeHttpError(405, "method_not_allowed", "Método não permitido.");
  }
}
