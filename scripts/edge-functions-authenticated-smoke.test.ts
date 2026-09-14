import { describe, expect, it } from "vitest";
import {
  parseExportArtifact,
  validateStagingSupabaseUrl,
} from "./edge-functions-authenticated-smoke";

describe("authenticated Edge Function smoke guards", () => {
  it("accepts only the exact ORHA staging Supabase origin", () => {
    expect(
      validateStagingSupabaseUrl("https://bgeauxljwjbtbwpbzpoo.supabase.co/"),
    ).toBe("https://bgeauxljwjbtbwpbzpoo.supabase.co");
    expect(() =>
      validateStagingSupabaseUrl("https://iuaczhkfmwpyhtpdmuyt.supabase.co"),
    ).toThrow("restricted to the ORHA staging project");
    expect(() =>
      validateStagingSupabaseUrl(
        "https://token@bgeauxljwjbtbwpbzpoo.supabase.co",
      ),
    ).toThrow("restricted to the ORHA staging project");
  });

  it("validates the private export artifact contract without exposing its URL", () => {
    const requestId = "10000000-0000-4000-8000-000000000001";
    expect(
      parseExportArtifact(
        {
          artifact: {
            requestId,
            downloadUrl:
              "https://bgeauxljwjbtbwpbzpoo.supabase.co/storage/v1/object/sign/private?token=secret",
            byteSize: 42,
            sha256: "a".repeat(64),
          },
        },
        requestId,
      ),
    ).toMatchObject({ requestId, byteSize: 42, sha256: "a".repeat(64) });
  });

  it("rejects mismatched ownership and untrusted artifact hosts", () => {
    const requestId = "10000000-0000-4000-8000-000000000001";
    expect(() =>
      parseExportArtifact(
        {
          artifact: {
            requestId: "20000000-0000-4000-8000-000000000002",
            downloadUrl:
              "https://bgeauxljwjbtbwpbzpoo.supabase.co/storage/export",
            byteSize: 42,
            sha256: "a".repeat(64),
          },
        },
        requestId,
      ),
    ).toThrow("Invalid account-export artifact contract");
    expect(() =>
      parseExportArtifact(
        {
          artifact: {
            requestId,
            downloadUrl: "https://attacker.example/export",
            byteSize: 42,
            sha256: "a".repeat(64),
          },
        },
        requestId,
      ),
    ).toThrow("untrusted download URL");
  });
});
