import { describe, expect, it } from "vitest";
import { supabaseConnection } from "./client";

describe("Supabase public client configuration", () => {
  it("exposes configuration status without exposing the key", () => {
    expect(supabaseConnection).not.toHaveProperty("publishableKey");
    expect(typeof supabaseConnection.configured).toBe("boolean");
  });
});
