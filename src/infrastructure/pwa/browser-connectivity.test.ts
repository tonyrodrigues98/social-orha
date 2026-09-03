import { describe, expect, it, vi } from "vitest";
import {
  readBrowserOnline,
  subscribeBrowserConnectivity,
  type BrowserConnectivityRuntime,
} from "./browser-connectivity";

describe("browser connectivity adapter", () => {
  it("defaults to online outside a browser and reflects the browser hint when available", () => {
    expect(readBrowserOnline({})).toBe(true);
    expect(readBrowserOnline({ navigator: { onLine: false } })).toBe(false);
  });

  it("subscribes to both reconnection boundaries and cleans them up", () => {
    const target = new EventTarget();
    const callback = vi.fn();
    const runtime: BrowserConnectivityRuntime = {
      navigator: { onLine: true },
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
    };
    const unsubscribe = subscribeBrowserConnectivity(callback, runtime);

    target.dispatchEvent(new Event("offline"));
    target.dispatchEvent(new Event("online"));
    expect(callback).toHaveBeenCalledTimes(2);

    unsubscribe();
    target.dispatchEvent(new Event("offline"));
    expect(callback).toHaveBeenCalledTimes(2);
  });
});

