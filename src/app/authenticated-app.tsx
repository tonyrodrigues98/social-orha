import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { BottomNavigation } from "./components/bottom-navigation";
import { CommunityPage } from "./pages/community-page";
import { ConversationsPage } from "./pages/conversations-page";
import { ExplorePage } from "./pages/explore-page";
import { HomePage } from "./pages/home-page";
import { ProfilePage } from "./pages/profile-page";
import type { AppSection } from "./types";

const pages: Record<AppSection, React.ComponentType> = {
  inicio: HomePage,
  comunidade: CommunityPage,
  explorar: ExplorePage,
  conversas: ConversationsPage,
  perfil: ProfilePage,
};

export function AuthenticatedApp() {
  const reduceMotion = useReducedMotion();
  const [section, setSection] = useState<AppSection>("inicio");

  useEffect(() => {
    const viewport = document.querySelector<HTMLElement>(".app-viewport");
    viewport?.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  }, [reduceMotion, section]);

  const ActivePage = pages[section];

  return (
    <>
      <div className="app-viewport">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={section}
            initial={reduceMotion ? false : { opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduceMotion ? { opacity: 1 } : { opacity: 0, x: -8 }}
            transition={{ duration: reduceMotion ? 0 : 0.22, ease: "easeOut" }}
          >
            <ActivePage />
          </motion.div>
        </AnimatePresence>
      </div>
      <BottomNavigation value={section} onChange={setSection} />
    </>
  );
}
