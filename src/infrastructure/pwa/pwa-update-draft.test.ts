import { describe, expect, it, vi } from "vitest";
import {
  applyPwaUpdateWithDraft,
  isSafePwaDraftField,
  parsePwaUpdateDraft,
  restorePwaUpdateDraft,
  type PwaUpdateDraft,
} from "./pwa-update-draft";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

const storageKey = "orha:pwa-update-draft:v1";

function serializedDraft(overrides: Partial<PwaUpdateDraft> = {}) {
  return JSON.stringify({
    version: 1,
    userId: "user-a",
    route: "/perfil",
    createdAt: 1_000,
    fields: [{ key: "id:bio", kind: "value", value: "Rascunho privado" }],
    ...overrides,
  });
}

describe("PWA update draft", () => {
  it("never persists credential, payment, file, or explicitly excluded controls", () => {
    expect(isSafePwaDraftField({ inputType: "password" })).toBe(false);
    expect(isSafePwaDraftField({ inputType: "file" })).toBe(false);
    expect(isSafePwaDraftField({ inputType: "text", autocomplete: "new-password" })).toBe(false);
    expect(isSafePwaDraftField({ inputType: "text", autocomplete: "section-card cc-number" })).toBe(false);
    expect(isSafePwaDraftField({ inputType: "text", excluded: true })).toBe(false);
    expect(isSafePwaDraftField({ inputType: "text", autocomplete: "nickname" })).toBe(true);
  });

  it("rejects malformed, oversized, or pathless serialized state", () => {
    expect(parsePwaUpdateDraft("not-json")).toBeNull();
    expect(parsePwaUpdateDraft(serializedDraft({ route: "perfil" }))).toBeNull();
    expect(parsePwaUpdateDraft(serializedDraft({ route: "/reset-password#access_token=secret" }))).toBeNull();
    expect(parsePwaUpdateDraft("x".repeat(70 * 1024))).toBeNull();
  });

  it("deletes a draft before a different principal can restore it", () => {
    const storage = new MemoryStorage();
    storage.setItem(storageKey, serializedDraft());

    expect(restorePwaUpdateDraft({
      userId: "user-b",
      storage,
      root: { querySelectorAll: () => [] as unknown as NodeListOf<Element> },
      location: { pathname: "/perfil" },
      now: 1_001,
    })).toBe("none");
    expect(storage.getItem(storageKey)).toBeNull();
  });

  it("expires transient state instead of turning it into durable private storage", () => {
    const storage = new MemoryStorage();
    storage.setItem(storageKey, serializedDraft());

    expect(restorePwaUpdateDraft({
      userId: "user-a",
      storage,
      root: { querySelectorAll: () => [] as unknown as NodeListOf<Element> },
      location: { pathname: "/perfil" },
      now: 1_000 + 16 * 60 * 1_000,
    })).toBe("none");
    expect(storage.getItem(storageKey)).toBeNull();
  });

  it("captures synchronously before asking the waiting worker to reload", async () => {
    const calls: string[] = [];
    const updateServiceWorker = vi.fn(async (reload?: boolean) => {
      calls.push(`update:${String(reload)}`);
    });

    await applyPwaUpdateWithDraft({
      userId: "user-a",
      captureDraft: ({ userId }) => {
        calls.push(`capture:${userId}`);
        return true;
      },
      updateServiceWorker,
    });

    expect(calls).toEqual(["capture:user-a", "update:true"]);
    expect(updateServiceWorker).toHaveBeenCalledWith(true);
  });
});
