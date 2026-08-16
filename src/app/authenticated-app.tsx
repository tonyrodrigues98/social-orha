import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { revokeAllRecordedAudioUrls } from "@/infrastructure/media/browser-audio-recorder";
import { BottomNavigation } from "./components/bottom-navigation";
import { PrototypeDrawer } from "./components/prototype-drawer";
import { CommunityPage } from "./pages/community-page";
import { ConversationsPage } from "./pages/conversations-page";
import { ExplorePage } from "./pages/explore-page";
import { HomePage } from "./pages/home-page";
import { ProfilePage } from "./pages/profile-page";
import { PrototypeProvider } from "./prototype-context";
import type { AppSection } from "./types";

const loadPrivateChatPage = () => import("./pages/private-chat-page");
const PrivateChatPage = lazy(() => loadPrivateChatPage().then((module) => ({ default: module.PrivateChatPage })));

const pages: Record<AppSection, React.ComponentType> = {
  inicio: HomePage,
  comunidade: CommunityPage,
  explorar: ExplorePage,
  conversas: ConversationsPage,
  perfil: ProfilePage,
};

function ChatLoadingSurface() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Abrindo conversa"
      style={{ position: "absolute", inset: 0, display: "grid", gridTemplateRows: "72px 1fr 68px", background: "#fff", color: "#202024" }}
    >
      <div style={{ borderBottom: "1px solid #ececef", background: "#fff" }} />
      <div style={{ display: "grid", placeItems: "center", fontSize: 13, color: "#74747d" }}>Abrindo conversa…</div>
      <div style={{ borderTop: "1px solid #ececef", background: "#fff" }} />
    </div>
  );
}

export function AuthenticatedApp() {
  const reduceMotion = useReducedMotion();
  const [section, setSection] = useState<AppSection>("inicio");
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (activeConversationId) return;
    const viewport = document.querySelector<HTMLElement>(".app-viewport");
    viewport?.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  }, [activeConversationId, reduceMotion, section]);

  useEffect(() => {
    if (section === "conversas") void loadPrivateChatPage();
  }, [section]);

  useEffect(() => revokeAllRecordedAudioUrls, []);

  const openChat = useCallback((conversationId: string) => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setActiveConversationId(conversationId);
  }, []);

  const closeChat = useCallback(() => {
    setActiveConversationId(null);
    window.requestAnimationFrame(() => returnFocusRef.current?.focus({ preventScroll: true }));
  }, []);

  const ActivePage = pages[section];
  const chatIsOpen = activeConversationId !== null;

  return (
    <PrototypeProvider navigate={setSection} openChat={openChat}>
      <div className={`app-viewport ${chatIsOpen ? "chat-viewport" : ""}`} style={{ background: "#fff" }}>
        <motion.div
          key={section}
          inert={chatIsOpen ? true : undefined}
          aria-hidden={chatIsOpen || undefined}
          initial={reduceMotion ? false : { x: 12 }}
          animate={{ x: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.18, ease: "easeOut" }}
          style={{ minHeight: "100%", background: "#fff" }}
        >
          <ActivePage />
        </motion.div>

        {activeConversationId ? (
          <motion.div
            className="private-chat-route"
            role="dialog"
            aria-modal="true"
            aria-label="Conversa privada"
            initial={reduceMotion ? false : { x: 16 }}
            animate={{ x: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2, ease: "easeOut" }}
            style={{ background: "#fff" }}
          >
            <Suspense fallback={<ChatLoadingSurface />}>
              <PrivateChatPage conversationId={activeConversationId} onBack={closeChat} />
            </Suspense>
          </motion.div>
        ) : null}
      </div>
      {!chatIsOpen ? <BottomNavigation value={section} onChange={setSection} /> : null}
      <PrototypeDrawer />
    </PrototypeProvider>
  );
}
