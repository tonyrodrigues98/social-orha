import { describe, expect, it } from "vitest";
import {
  buildPostCommentReportPath,
  extensionForCommunityMedia,
  nextCommunityRuleOrder,
  normalizeCommunityCategory,
  validateCommunityMediaFile,
  validateCommunityRule,
  validateCommunityUpdate,
} from "./community-management";

describe("community management domain", () => {
  it("normalizes and validates community fields", () => {
    expect(normalizeCommunityCategory("Fé e Vida")) .toBe("fe_e_vida");
    expect(validateCommunityUpdate({
      name: "  Café e conversa  ",
      description: "  Depois do culto  ",
      category: "Fé e Vida",
      visibility: "private",
    })).toEqual({
      name: "Café e conversa",
      description: "Depois do culto",
      category: "fe_e_vida",
      visibility: "private",
    });
    expect(() => validateCommunityUpdate({
      name: "x",
      description: null,
      category: "general",
      visibility: "public",
    })).toThrow("entre 3 e 100");
  });

  it("validates ordered rules", () => {
    expect(validateCommunityRule({
      title: "  Respeito  ",
      description: "  Converse com gentileza.  ",
      sortOrder: 2,
    })).toEqual({
      title: "Respeito",
      description: "Converse com gentileza.",
      sortOrder: 2,
    });
    expect(() => validateCommunityRule({
      title: "Ok",
      description: "Válida",
      sortOrder: 50,
    })).toThrow("posição");
    expect(nextCommunityRuleOrder([0, 2, 3])).toBe(1);
    expect(nextCommunityRuleOrder(Array.from({ length: 50 }, (_, index) => index))).toBeNull();
  });

  it("allows only storage-policy media types and size", () => {
    const image = new File([new Uint8Array(32)], "foto.webp", { type: "image/webp" });
    expect(() => validateCommunityMediaFile(image, "post")).not.toThrow();
    expect(extensionForCommunityMedia(image.type)).toBe("webp");
    const audio = new File([new Uint8Array(32)], "audio.mp3", { type: "audio/mpeg" });
    expect(() => validateCommunityMediaFile(audio, "post")).toThrow("imagens");
  });

  it("builds the real comment report deep link", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    expect(buildPostCommentReportPath(id)).toBe(`/denunciar/post_comment/${id}`);
    expect(() => buildPostCommentReportPath("../admin")).toThrow("Comentário inválido");
  });
});
