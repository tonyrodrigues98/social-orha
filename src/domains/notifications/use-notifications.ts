import { useCallback, useEffect, useRef, useState } from "react";
import { NotificationError } from "./errors";
import { useNotificationRepository } from "./use-notification-repository";
import type {
  Notification,
  NotificationCategory,
  NotificationPreferences,
  NotificationPreferencesUpdate,
} from "./types";

export type NotificationCenterState = {
  items: Notification[];
  unreadCount: number;
  nextCursor: string | null;
  status: "loading" | "ready" | "error";
  error: string | null;
  isLoadingMore: boolean;
};

function messageFromError(error: unknown): string {
  if (error instanceof NotificationError) return error.message;
  return "Não foi possível carregar suas notificações agora.";
}

export function useNotificationCenter({
  category = "all",
  unreadOnly = false,
}: {
  category?: NotificationCategory | "all";
  unreadOnly?: boolean;
} = {}) {
  const repository = useNotificationRepository();
  const requestId = useRef(0);
  const abortController = useRef<AbortController | null>(null);
  const [state, setState] = useState<NotificationCenterState>({
    items: [],
    unreadCount: 0,
    nextCursor: null,
    status: "loading",
    error: null,
    isLoadingMore: false,
  });
  const stateRef = useRef(state);
  stateRef.current = state;

  const load = useCallback(
    async (append = false) => {
      const activeRequest = ++requestId.current;
      abortController.current?.abort();
      const controller = new AbortController();
      abortController.current = controller;
      setState((current) => ({
        ...current,
        items: append ? current.items : [],
        nextCursor: append ? current.nextCursor : null,
        status: append ? current.status : "loading",
        error: null,
        isLoadingMore: append,
      }));
      try {
        const page = await repository.list({
          category,
          unreadOnly,
          cursor: append ? stateRef.current.nextCursor : null,
          limit: 20,
          signal: controller.signal,
        });
        if (activeRequest !== requestId.current) return;
        setState((current) => {
          const known = new Set(append ? current.items.map((item) => item.id) : []);
          return {
            items: append
              ? [...current.items, ...page.items.filter((item) => !known.has(item.id))]
              : page.items,
            unreadCount: page.unreadCount,
            nextCursor: page.nextCursor,
            status: "ready",
            error: null,
            isLoadingMore: false,
          };
        });
      } catch (error) {
        if (activeRequest !== requestId.current || controller.signal.aborted) return;
        setState((current) => ({
          ...current,
          status: "error",
          error: messageFromError(error),
          isLoadingMore: false,
        }));
      } finally {
        if (abortController.current === controller) abortController.current = null;
      }
    },
    [category, repository, unreadOnly],
  );

  useEffect(() => {
    void load(false);
    return () => {
      requestId.current += 1;
      abortController.current?.abort();
    };
  }, [load]);

  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => void) | null = null;
    void repository
      .subscribe(() => void load(false))
      .then((cleanup) => {
        if (disposed) cleanup();
        else {
          unsubscribe = cleanup;
          void load(false);
        }
      })
      .catch((cause: unknown) => {
        if (!disposed) {
          setState((current) => ({ ...current, error: messageFromError(cause) }));
        }
      });
    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [load, repository]);

  const markRead = useCallback(
    async (ids: readonly string[]) => {
      await repository.markRead(ids);
      setState((current) => ({
        ...current,
        items: current.items.map((item) =>
          ids.includes(item.id) && !item.readAt
            ? { ...item, readAt: new Date().toISOString() }
            : item,
        ),
        unreadCount: Math.max(
          0,
          current.unreadCount - current.items.filter((item) => ids.includes(item.id) && !item.readAt).length,
        ),
      }));
    },
    [repository],
  );

  const markAllRead = useCallback(async () => {
    await repository.markAllRead();
    setState((current) => ({
      ...current,
      items: current.items.map((item) => ({
        ...item,
        readAt: item.readAt ?? new Date().toISOString(),
      })),
      unreadCount: 0,
    }));
  }, [repository]);

  return {
    ...state,
    reload: () => load(false),
    loadMore: () => (stateRef.current.nextCursor ? load(true) : Promise.resolve()),
    markRead,
    markAllRead,
  };
}

export function useNotificationPreferences() {
  const repository = useNotificationRepository();
  const requestId = useRef(0);
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const activeRequest = ++requestId.current;
    setStatus("loading");
    setError(null);
    try {
      const loaded = await repository.getPreferences();
      if (activeRequest !== requestId.current) return;
      setPreferences(loaded);
      setStatus("ready");
    } catch (cause) {
      if (activeRequest !== requestId.current) return;
      setError(messageFromError(cause));
      setStatus("error");
    }
  }, [repository]);

  useEffect(() => {
    let disposed = false;
    queueMicrotask(() => {
      if (!disposed) void reload();
    });
    return () => {
      disposed = true;
      requestId.current += 1;
    };
  }, [reload]);

  const save = useCallback(
    async (input: NotificationPreferencesUpdate) => {
      const activeRequest = ++requestId.current;
      setStatus("saving");
      setError(null);
      try {
        const saved = await repository.updatePreferences(input);
        if (activeRequest !== requestId.current) return saved;
        setPreferences(saved);
        setStatus("ready");
        return saved;
      } catch (cause) {
        if (activeRequest !== requestId.current) throw cause;
        setError(messageFromError(cause));
        setStatus("error");
        throw cause;
      }
    },
    [repository],
  );

  return { preferences, status, error, reload, save };
}
