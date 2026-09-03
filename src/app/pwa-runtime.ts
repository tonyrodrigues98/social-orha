import { useEffect, useSyncExternalStore } from "react";
import type { AuthStatus } from "./auth/auth-context";
import {
  readBrowserOnline,
  subscribeBrowserConnectivity,
} from "@/infrastructure/pwa/browser-connectivity";
import {
  clearPwaUpdateDraft,
  restorePwaUpdateDraft,
} from "@/infrastructure/pwa/pwa-update-draft";

export function useBrowserOnline(): boolean {
  return useSyncExternalStore(
    subscribeBrowserConnectivity,
    readBrowserOnline,
    () => true,
  );
}

export function usePwaUpdateDraftRestoration({
  authStatus,
  userId,
}: {
  authStatus: AuthStatus;
  userId: string | null | undefined;
}): void {
  useEffect(() => {
    if (authStatus === "initializing" || authStatus === "loading_identity") return;
    if (!userId) {
      clearPwaUpdateDraft();
      return;
    }

    const attemptRestore = () => restorePwaUpdateDraft({ userId });
    if (attemptRestore() !== "pending") return;

    const observer = new MutationObserver(() => {
      if (attemptRestore() === "restored") observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const timeout = window.setTimeout(() => observer.disconnect(), 20_000);
    return () => {
      window.clearTimeout(timeout);
      observer.disconnect();
    };
  }, [authStatus, userId]);
}

