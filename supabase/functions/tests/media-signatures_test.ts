import { inspectMedia, MediaInspectionError } from "../_shared/media-signatures.ts";
import { constantTimeEqual } from "../_shared/worker-auth.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0, 0, 0, 13], 8);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

Deno.test("media inspection decodes image dimensions", () => {
  const bytes = png(430, 932);
  const inspected = inspectMedia(bytes, {
    mimeType: "image/png",
    byteSize: bytes.length,
    width: 430,
    height: 932,
  });
  assert(inspected.width === 430 && inspected.height === 932, "PNG dimensions were not decoded");
});

Deno.test("media inspection rejects forged metadata", () => {
  const bytes = png(430, 932);
  try {
    inspectMedia(bytes, { mimeType: "image/jpeg", byteSize: bytes.length });
    throw new Error("forged MIME was accepted");
  } catch (cause) {
    assert(cause instanceof MediaInspectionError, "unexpected rejection error");
  }
});

Deno.test("media inspection rejects PDF without malware quarantine", () => {
  const bytes = new TextEncoder().encode("%PDF-1.7\n% untrusted");
  try {
    inspectMedia(bytes, { mimeType: "application/pdf", byteSize: bytes.length });
    throw new Error("PDF was accepted without quarantine scanning");
  } catch (cause) {
    assert(cause instanceof MediaInspectionError, "unexpected rejection error");
  }
});

Deno.test("cron secret comparison is deterministic", async () => {
  assert(await constantTimeEqual("same-secret", "same-secret"), "same secrets differ");
  assert(!(await constantTimeEqual("same-secret", "other-secret")), "different secrets match");
});
