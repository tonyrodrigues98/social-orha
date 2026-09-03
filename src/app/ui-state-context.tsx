/* eslint-disable react-refresh/only-export-components -- Provider and its typed hook intentionally share this module. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AppSection } from "./types";
import type { ReactionKind } from "@/domains/social";
import type { FriendshipPanelTab } from "./social/friendships-panel-model";

export type DrawerView =
  | { type: "search" }
  | { type: "friendships"; initialTab?: FriendshipPanelTab }
  | { type: "notifications" }
  | { type: "person"; personName: string; profileId: string }
  | { type: "community"; communityName: string; communityId: string }
  | {
      type: "topic";
      topic: string;
      postId: string;
      communityId?: string;
      reactionCount: number;
      viewerReaction: ReactionKind | null;
    }
  | { type: "create-post"; communityId?: string }
  | { type: "create-community" };

export type AppUiNavigation =
  | AppSection
  | { type: "report"; targetType: "message"; targetId: string };

type AppUiContextValue = {
  navigate: (destination: AppUiNavigation) => void;
  openConversation: (conversationId: string) => void;
  drawer: DrawerView | null;
  openDrawer: (view: DrawerView) => void;
  closeDrawer: () => void;
  toast: string | null;
  announce: (message: string) => void;
};

const AppUiContext = createContext<AppUiContextValue | null>(null);

export function AppUiProvider({
  children,
  navigate,
  openConversation,
}: {
  children: ReactNode;
  navigate: (destination: AppUiNavigation) => void;
  openConversation: (conversationId: string) => void;
}) {
  const [drawer, setDrawer] = useState<DrawerView | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    },
    [],
  );

  const announce = useCallback((message: string) => {
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = window.setTimeout(() => setToast(null), 2_800);
  }, []);
  const openDrawer = useCallback((view: DrawerView) => setDrawer(view), []);
  const closeDrawer = useCallback(() => setDrawer(null), []);

  return (
    <AppUiContext.Provider
      value={{
        navigate,
        openConversation,
        drawer,
        openDrawer,
        closeDrawer,
        toast,
        announce,
      }}
    >
      {children}
    </AppUiContext.Provider>
  );
}

export function useAppUi(): AppUiContextValue {
  const context = useContext(AppUiContext);
  if (!context) {
    throw new Error("useAppUi precisa estar dentro de AppUiProvider.");
  }
  return context;
}
