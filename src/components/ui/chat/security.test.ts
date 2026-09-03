import { describe, expect, it } from "vitest";
import { validateFile } from "./security";

describe("chat outbound media allowlist", () => {
  it("accepts launch image and audio formats", () => {
    expect(validateFile(new File(["image"], "photo.webp", { type: "image/webp" }))).toEqual({ valid: true });
    expect(validateFile(new File(["audio"], "voice.wav", { type: "audio/wav" }))).toEqual({ valid: true });
  });

  it("rejects generic documents before they enter the composer", () => {
    expect(validateFile(new File(["pdf"], "document.pdf", { type: "application/pdf" }))).toMatchObject({
      valid: false,
    });
  });
});
