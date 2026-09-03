import { parseJsonObject } from "../_shared/http.ts";
import { EdgeHttpError } from "../_shared/runtime.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("JSON body limit measures actual UTF-8 bytes without Content-Length", async () => {
  const request = new Request("https://orha.invalid/functions/v1/media-verify", {
    method: "POST",
    body: JSON.stringify({ value: "oração" }),
  });
  try {
    await parseJsonObject(request, 12);
    throw new Error("oversized chunked body was accepted");
  } catch (cause) {
    assert(cause instanceof EdgeHttpError, "unexpected error type");
    assert(cause.status === 413 && cause.code === "request_too_large", "wrong body-limit error");
  }
});
