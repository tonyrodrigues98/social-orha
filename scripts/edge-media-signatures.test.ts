import { describe, expect, it } from "vitest";
import {
  inspectMedia,
  MediaInspectionError,
} from "../supabase/functions/_shared/media-signatures.ts";

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0, 0, 0, 13], 8);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

describe("Edge media signature inspection", () => {
  it("decodes PNG dimensions from the trusted bytes", () => {
    const bytes = png(390, 844);
    expect(inspectMedia(bytes, {
      mimeType: "image/png",
      byteSize: bytes.length,
      width: 390,
      height: 844,
    })).toEqual({ mimeType: "image/png", width: 390, height: 844 });
  });

  it("rejects a declared MIME that does not match the magic bytes", () => {
    const bytes = png(100, 100);
    expect(() => inspectMedia(bytes, {
      mimeType: "image/jpeg",
      byteSize: bytes.length,
      width: 100,
      height: 100,
    })).toThrowError(MediaInspectionError);
  });

  it("accepts RIFF/WAVE audio and rejects a forged byte size", () => {
    const bytes = new Uint8Array(16);
    bytes.set(new TextEncoder().encode("RIFF"), 0);
    bytes.set(new TextEncoder().encode("WAVE"), 8);
    expect(inspectMedia(bytes, { mimeType: "audio/wav", byteSize: 16 })).toMatchObject({ mimeType: "audio/wav" });
    expect(() => inspectMedia(bytes, { mimeType: "audio/wav", byteSize: 15 })).toThrowError("byte_size_mismatch");
  });

  it("does not promote PDFs or generic downloadable files without quarantine scanning", () => {
    const bytes = new TextEncoder().encode("%PDF-1.7\n% launch-hostile-file");
    expect(() => inspectMedia(bytes, {
      mimeType: "application/pdf",
      byteSize: bytes.length,
    })).toThrowError("unknown_signature");
  });
});
