import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { BrandMark } from "./brand-mark";

type SplashScreenProps = {
  ready?: boolean;
  onFinished?: () => void;
};

export function SplashScreen({ ready = false, onFinished }: SplashScreenProps) {
  const reduceMotion = useReducedMotion();
  const [entered, setEntered] = useState(false);
  const [minimumDisplayReached, setMinimumDisplayReached] = useState(false);
  const finishNotified = useRef(false);

  useEffect(() => {
    const entryTimer = window.setTimeout(() => setEntered(true), 600);
    const minimumDisplayTimer = window.setTimeout(() => setMinimumDisplayReached(true), 2600);
    return () => {
      window.clearTimeout(entryTimer);
      window.clearTimeout(minimumDisplayTimer);
    };
  }, []);

  const exiting = ready && entered && minimumDisplayReached;

  return (
    <div className="splash-screen" role="status" aria-label="Abrindo ORHA">
      <motion.div
        className="splash-content"
        initial={reduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.86, filter: "blur(12px)" }}
        animate={exiting
          ? { opacity: 0, scale: reduceMotion ? 1 : 1.04, filter: reduceMotion ? "blur(0px)" : "blur(12px)" }
          : { opacity: 1, scale: 1, filter: "blur(0px)" }}
        transition={{ duration: exiting || reduceMotion ? 0.4 : 0.6, ease: [0.22, 1, 0.36, 1] }}
        onAnimationComplete={() => {
          if (exiting && !finishNotified.current) {
            finishNotified.current = true;
            onFinished?.();
          }
        }}
      >
        <BrandMark className="splash-logo" />
        <span className="splash-caption">Conhe&#xE7;a <b>&#8226;</b> Conecte-se <b>&#8226;</b> Perten&#xE7;a</span>
      </motion.div>
    </div>
  );
}
