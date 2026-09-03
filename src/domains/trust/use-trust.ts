import { useCallback, useEffect, useRef, useState } from "react";
import { TrustError } from "./errors";
import { useTrustRepository } from "./use-trust-repository";
import type { TrustRepository } from "./repository";
import type {
  ApplyModerationActionInput,
  AccountLifecycleKind,
  AccountLifecycleRequest,
  CreateReportInput,
  BlockedProfile,
  ModerationQueueRequest,
  Report,
  TrustPage,
  TrustPageRequest,
} from "./types";

function trustErrorMessage(error: unknown): string {
  if (error instanceof TrustError) return error.message;
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Não foi possível concluir esta ação agora.";
}

function useTrustPage<T extends { id: string }>(
  load: (request: TrustPageRequest) => Promise<TrustPage<T>>,
  dependencyKey: string,
) {
  const [items, setItems] = useState<T[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const requestId = useRef(0);
  const abortController = useRef<AbortController | null>(null);
  const nextCursorRef = useRef(nextCursor);

  const requestPage = useCallback(
    async (append = false) => {
      const activeRequest = ++requestId.current;
      abortController.current?.abort();
      const controller = new AbortController();
      abortController.current = controller;
      setError(null);
      if (append) setIsLoadingMore(true);
      else {
        setItems([]);
        setNextCursor(null);
        nextCursorRef.current = null;
        setStatus("loading");
      }
      try {
        const page = await load({
          cursor: append ? nextCursorRef.current : null,
          limit: 20,
          signal: controller.signal,
        });
        if (activeRequest !== requestId.current || controller.signal.aborted) return;
        setItems((current) => {
          if (!append) return page.items;
          const known = new Set(current.map((item) => item.id));
          return [...current, ...page.items.filter((item) => !known.has(item.id))];
        });
        nextCursorRef.current = page.nextCursor;
        setNextCursor(page.nextCursor);
        setStatus("ready");
      } catch (cause) {
        if (activeRequest !== requestId.current || controller.signal.aborted) return;
        setError(trustErrorMessage(cause));
        setStatus("error");
      } finally {
        if (activeRequest === requestId.current) setIsLoadingMore(false);
        if (abortController.current === controller) abortController.current = null;
      }
    },
    [load],
  );

  useEffect(() => {
    let disposed = false;
    queueMicrotask(() => {
      if (!disposed) void requestPage(false);
    });
    return () => {
      disposed = true;
      requestId.current += 1;
      abortController.current?.abort();
    };
  }, [dependencyKey, requestPage]);

  return {
    items,
    nextCursor,
    status,
    error,
    isLoadingMore,
    reload: () => requestPage(false),
    loadMore: () => (nextCursorRef.current ? requestPage(true) : Promise.resolve()),
  };
}

export function useBlockedProfiles() {
  const repository = useTrustRepository();
  const load = useCallback(
    (request: TrustPageRequest) => repository.listBlockedProfiles(request),
    [repository],
  );
  const query = useTrustPage<BlockedProfile>(load, "blocked-profiles");
  const unblock = useCallback(
    async (profileId: string) => {
      await repository.unblockProfile(profileId);
      await query.reload();
    },
    [query, repository],
  );
  return { ...query, unblock };
}

export function useProfileBlock(profileId: string) {
  const repository = useTrustRepository();
  const [blockRecord, setBlockRecord] = useState<BlockedProfile | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    const activeRequest = ++requestId.current;
    setStatus("loading");
    setError(null);
    try {
      const next = await repository.getBlockedProfile(profileId);
      if (activeRequest !== requestId.current) return;
      setBlockRecord(next);
      setStatus("ready");
    } catch (cause) {
      if (activeRequest !== requestId.current) return;
      setError(trustErrorMessage(cause));
      setStatus("error");
    }
  }, [profileId, repository]);

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

  const block = useCallback(
    async (reason?: string | null) => {
      const activeRequest = ++requestId.current;
      setStatus("saving");
      setError(null);
      try {
        const created = await repository.blockProfile(profileId, reason);
        if (activeRequest !== requestId.current) return created;
        setBlockRecord(created);
        setStatus("ready");
        return created;
      } catch (cause) {
        if (activeRequest !== requestId.current) throw cause;
        setError(trustErrorMessage(cause));
        setStatus("error");
        throw cause;
      }
    },
    [profileId, repository],
  );

  const unblock = useCallback(async () => {
    const activeRequest = ++requestId.current;
    setStatus("saving");
    setError(null);
    try {
      await repository.unblockProfile(profileId);
      if (activeRequest !== requestId.current) return;
      setBlockRecord(null);
      setStatus("ready");
    } catch (cause) {
      if (activeRequest !== requestId.current) throw cause;
      setError(trustErrorMessage(cause));
      setStatus("error");
      throw cause;
    }
  }, [profileId, repository]);

  return {
    blockRecord,
    isBlocked: Boolean(blockRecord),
    status,
    error,
    reload,
    block,
    unblock,
  };
}

export function useModerationQueue(status: ModerationQueueRequest["status"] = "open") {
  const repository = useTrustRepository();
  const load = useCallback(
    (request: TrustPageRequest) => repository.listModerationQueue({ ...request, status }),
    [repository, status],
  );
  const query = useTrustPage<Report>(load, status ?? "open");
  const applyAction = useCallback(
    async (input: ApplyModerationActionInput) => {
      const action = await repository.applyModerationAction(input);
      await query.reload();
      return action;
    },
    [query, repository],
  );
  return { ...query, applyAction };
}

export function useModerationReportContext(reportId: string | null) {
  const repository = useTrustRepository();
  const requestId = useRef(0);
  const [context, setContext] = useState<Awaited<
    ReturnType<TrustRepository["getModerationReportContext"]>
  > | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const activeRequest = ++requestId.current;
    if (!reportId) {
      setContext(null);
      setStatus("idle");
      setError(null);
      return;
    }
    setContext(null);
    setStatus("loading");
    setError(null);
    try {
      const loaded = await repository.getModerationReportContext(reportId);
      if (activeRequest !== requestId.current) return;
      setContext(loaded);
      setStatus("ready");
    } catch (cause) {
      if (activeRequest !== requestId.current) return;
      setError(trustErrorMessage(cause));
      setStatus("error");
    }
  }, [reportId, repository]);

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

  return { context, status, error, reload };
}

export function useModerationReportAttachments(reportId: string) {
  const repository = useTrustRepository();
  const mounted = useRef(true);
  const [items, setItems] = useState<Record<string, Awaited<
    ReturnType<TrustRepository["getModerationReportAttachment"]>
  >>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async (attachmentId: string) => {
    setPendingId(attachmentId);
    setError(null);
    try {
      const attachment = await repository.getModerationReportAttachment(reportId, attachmentId);
      if (!mounted.current) return attachment;
      setItems((current) => ({ ...current, [attachmentId]: attachment }));
      return attachment;
    } catch (cause) {
      if (!mounted.current) throw cause;
      setError(trustErrorMessage(cause));
      throw cause;
    } finally {
      if (mounted.current) setPendingId(null);
    }
  }, [reportId, repository]);

  return { items, pendingId, error, load };
}

export function useAccountSecurity() {
  const repository = useTrustRepository();
  const requestId = useRef(0);
  const [summary, setSummary] = useState<Awaited<ReturnType<TrustRepository["getAccountSecurity"]>> | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const activeRequest = ++requestId.current;
    setStatus("loading");
    setError(null);
    try {
      const loaded = await repository.getAccountSecurity();
      if (activeRequest !== requestId.current) return;
      setSummary(loaded);
      setStatus("ready");
    } catch (cause) {
      if (activeRequest !== requestId.current) return;
      setError(trustErrorMessage(cause));
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

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      const activeRequest = ++requestId.current;
      setStatus("saving");
      setError(null);
      try {
        await repository.changePassword(currentPassword, newPassword);
        if (activeRequest !== requestId.current) return;
        setStatus("ready");
      } catch (cause) {
        if (activeRequest !== requestId.current) throw cause;
        setError(trustErrorMessage(cause));
        setStatus("error");
        throw cause;
      }
    },
    [repository],
  );

  const signOutEverywhere = useCallback(async () => {
    const activeRequest = ++requestId.current;
    setStatus("saving");
    setError(null);
    try {
      await repository.signOutEverywhere();
      if (activeRequest !== requestId.current) return;
      setStatus("ready");
    } catch (cause) {
      if (activeRequest !== requestId.current) throw cause;
      setError(trustErrorMessage(cause));
      setStatus("error");
      throw cause;
    }
  }, [repository]);

  return {
    summary,
    status,
    error,
    reload,
    changePassword,
    signOutEverywhere,
  };
}

export function useAccountLifecycle() {
  const repository = useTrustRepository();
  const requestId = useRef(0);
  const [requests, setRequests] = useState<AccountLifecycleRequest[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const activeRequest = ++requestId.current;
    setStatus("loading");
    setError(null);
    try {
      const loaded = await repository.listAccountLifecycleRequests();
      if (activeRequest !== requestId.current) return;
      setRequests(loaded);
      setStatus("ready");
    } catch (cause) {
      if (activeRequest !== requestId.current) return;
      setError(trustErrorMessage(cause));
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

  const request = useCallback(
    async (kind: AccountLifecycleKind, currentPassword?: string) => {
      const activeRequest = ++requestId.current;
      setStatus("saving");
      setError(null);
      try {
        const created = await repository.createAccountLifecycleRequest({ kind, currentPassword });
        if (activeRequest !== requestId.current) return created;
        setRequests((current) => [created, ...current.filter((item) => item.id !== created.id)]);
        setStatus("ready");
        return created;
      } catch (cause) {
        if (activeRequest !== requestId.current) throw cause;
        setError(trustErrorMessage(cause));
        setStatus("error");
        throw cause;
      }
    },
    [repository],
  );

  const cancel = useCallback(
    async (lifecycleRequestId: string) => {
      const activeRequest = ++requestId.current;
      setStatus("saving");
      setError(null);
      try {
        const cancelled = await repository.cancelAccountLifecycleRequest(lifecycleRequestId);
        if (activeRequest !== requestId.current) return cancelled;
        setRequests((current) =>
          current.map((item) => (item.id === cancelled.id ? cancelled : item)),
        );
        setStatus("ready");
        return cancelled;
      } catch (cause) {
        if (activeRequest !== requestId.current) throw cause;
        setError(trustErrorMessage(cause));
        setStatus("error");
        throw cause;
      }
    },
    [repository],
  );

  return { requests, status, error, reload, request, cancel };
}

export function useAccountAccess() {
  const repository = useTrustRepository();
  const requestId = useRef(0);
  const [summary, setSummary] = useState<Awaited<
    ReturnType<TrustRepository["getAccountAccess"]>
  > | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const activeRequest = ++requestId.current;
    setStatus("loading");
    setError(null);
    try {
      const loaded = await repository.getAccountAccess();
      if (activeRequest !== requestId.current) return;
      setSummary(loaded);
      setStatus("ready");
    } catch (cause) {
      if (activeRequest !== requestId.current) return;
      setError(trustErrorMessage(cause));
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

  return { summary, status, error, reload };
}

export function useReportSubmission() {
  const repository = useTrustRepository();
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (input: CreateReportInput) => {
      setStatus("submitting");
      setError(null);
      try {
        const report = await repository.createReport(input);
        setStatus("success");
        return report;
      } catch (cause) {
        setError(trustErrorMessage(cause));
        setStatus("error");
        throw cause;
      }
    },
    [repository],
  );

  return { status, error, submit, reset: () => { setStatus("idle"); setError(null); } };
}
