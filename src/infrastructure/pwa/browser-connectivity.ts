export type BrowserConnectivityRuntime = {
  navigator?: Pick<Navigator, "onLine">;
  addEventListener?: Window["addEventListener"];
  removeEventListener?: Window["removeEventListener"];
};

function defaultRuntime(): BrowserConnectivityRuntime {
  if (typeof window === "undefined" || typeof navigator === "undefined") return {};
  return window;
}

export function readBrowserOnline(runtime: BrowserConnectivityRuntime = defaultRuntime()): boolean {
  return runtime.navigator?.onLine ?? true;
}

export function subscribeBrowserConnectivity(
  callback: () => void,
  runtime: BrowserConnectivityRuntime = defaultRuntime(),
): () => void {
  if (!runtime.addEventListener || !runtime.removeEventListener) return () => undefined;
  runtime.addEventListener("online", callback);
  runtime.addEventListener("offline", callback);
  return () => {
    runtime.removeEventListener?.("online", callback);
    runtime.removeEventListener?.("offline", callback);
  };
}

