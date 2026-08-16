import { describe, expect, it } from "vitest";
import {
  MAX_PROFILE_IMAGE_BYTES,
  validateProfileMediaSelection,
} from "./profile-media";

function imageFile(type = "image/jpeg", size = 32) {
  return { name: "foto", type, size } as File;
}

describe("validateProfileMediaSelection", () => {
  it("aceita apenas imagens raster compatíveis dentro do limite", () => {
    const files = [imageFile("image/jpeg"), imageFile("image/webp")];

    expect(validateProfileMediaSelection(files, 2)).toEqual({ ok: true, files });
  });

  it("rejeita tipos ativos ou não interoperáveis", () => {
    const result = validateProfileMediaSelection([imageFile("image/svg+xml")], 1);

    expect(result).toMatchObject({ ok: false, code: "type" });
  });

  it("rejeita arquivos vazios ou acima de 10 MB", () => {
    expect(validateProfileMediaSelection([imageFile("image/png", 0)], 1)).toMatchObject({
      ok: false,
      code: "size",
    });
    expect(
      validateProfileMediaSelection([imageFile("image/png", MAX_PROFILE_IMAGE_BYTES + 1)], 1),
    ).toMatchObject({ ok: false, code: "size" });
  });

  it("rejeita a seleção inteira antes de ultrapassar as vagas disponíveis", () => {
    const result = validateProfileMediaSelection(
      [imageFile(), imageFile(), imageFile()],
      2,
    );

    expect(result).toMatchObject({ ok: false, code: "limit" });
  });
});
