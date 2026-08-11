"use client";

import {
  AnimatePresence,
  motion,
  type PanInfo,
  useDragControls,
} from "framer-motion";
import * as React from "react";
import { createPortal } from "react-dom";

export type DrawerSide = "bottom" | "right";

export type DrawerProps = {
  /** Controlled open state. */
  open: boolean;
  /** Called when the drawer requests to open or close. */
  onOpenChange: (open: boolean) => void;
  /** Side the drawer slides in from. */
  side?: DrawerSide;
  /** Optional accessible title rendered at the top. */
  title?: React.ReactNode;
  /** Extra classes for the panel. */
  className?: string;
  children?: React.ReactNode;
};

const PANEL_BY_SIDE: Record<DrawerSide, string> = {
  bottom:
    "inset-x-0 bottom-0 max-h-[90vh] rounded-t-2xl border-t border-border",
  right:
    "inset-y-0 right-0 w-full max-w-md rounded-l-2xl border-l border-border",
};

const CLOSE_OFFSET = 120;
const CLOSE_VELOCITY = 600;

function useMounted() {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  return mounted;
}

const Drawer = React.forwardRef<HTMLDivElement, DrawerProps>(
  (
    { open, onOpenChange, side = "bottom", title, className, children },
    ref,
  ) => {
    const mounted = useMounted();
    const isBottom = side === "bottom";
    const dragControls = useDragControls();

    React.useEffect(() => {
      if (!open) return;
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") onOpenChange(false);
      };
      document.addEventListener("keydown", onKey);
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.removeEventListener("keydown", onKey);
        document.body.style.overflow = prevOverflow;
      };
    }, [open, onOpenChange]);

    const handleDragEnd = (
      _e: MouseEvent | TouchEvent | PointerEvent,
      info: PanInfo,
    ) => {
      const offset = isBottom ? info.offset.y : info.offset.x;
      const velocity = isBottom ? info.velocity.y : info.velocity.x;
      if (offset > CLOSE_OFFSET || velocity > CLOSE_VELOCITY) {
        onOpenChange(false);
      }
    };

    if (!mounted) return null;

    const hidden = isBottom ? { y: "100%" } : { x: "100%" };
    const shown = isBottom ? { y: 0 } : { x: 0 };

    return createPortal(
      <AnimatePresence>
        {open ? (
          <div className="fixed inset-0 z-modal">
            <motion.div
              aria-hidden
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => onOpenChange(false)}
              className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
            />
            <motion.div
              ref={ref}
              role="dialog"
              aria-modal="true"
              data-slot="drawer"
              initial={hidden}
              animate={shown}
              exit={hidden}
              transition={{
                type: "spring",
                damping: 32,
                stiffness: 320,
                mass: 0.9,
              }}
              drag={isBottom ? "y" : "x"}
              dragControls={dragControls}
              dragListener={false}
              dragConstraints={{ top: 0, bottom: 0, left: 0, right: 0 }}
              dragElastic={
                isBottom ? { top: 0, bottom: 0.6 } : { left: 0, right: 0.6 }
              }
              onDragEnd={handleDragEnd}
              className={`absolute flex flex-col bg-card p-5 text-card-foreground shadow-xl ${PANEL_BY_SIDE[side]} ${className ?? ""}`}
            >
              <div
                data-slot="drawer-handle"
                className="-mt-2 mb-1 flex h-10 w-full shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
                style={{ touchAction: "none" }}
                onPointerDown={(event) => dragControls.start(event)}
              >
                <div
                  aria-hidden
                  className="h-1.5 w-12 rounded-full bg-muted-foreground/30"
                />
              </div>
              {title ? (
                <h2 className="mb-3 text-lg font-semibold text-foreground">
                  {title}
                </h2>
              ) : null}
              <div className="min-h-0 overflow-y-auto overscroll-contain">
                {children}
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>,
      document.body,
    );
  },
);
Drawer.displayName = "Drawer";

export { Drawer };
