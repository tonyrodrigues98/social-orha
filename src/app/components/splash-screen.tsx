import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { BrandMark } from "./brand-mark";

type SplashScreenProps = {
  onFinished?: () => void;
};

export function SplashScreen({ onFinished }: SplashScreenProps) {
  const reduceMotion = useReducedMotion();
  const [phase, setPhase] = useState<"in" | "out">("in");

  useEffect(() => {
    const exitTimer = window.setTimeout(() => setPhase("out"), 2400);
    const finishTimer = window.setTimeout(() => onFinished?.(), 2800);
    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(finishTimer);
    };
  }, [onFinished]);

  return (
    <div className="splash-screen" role="status" aria-label="Abrindo ORHA">
      <motion.div
        className="splash-content"
        initial={reduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.86, filter: "blur(12px)" }}
        animate={phase === "out"
          ? { opacity: 0, scale: reduceMotion ? 1 : 1.04, filter: reduceMotion ? "blur(0px)" : "blur(12px)" }
          : { opacity: 1, scale: 1, filter: "blur(0px)" }}
        transition={{ duration: phase === "out" || reduceMotion ? 0.4 : 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <BrandMark className="splash-logo" />
        <div className="splash-divider" aria-hidden="true"><span /><i /><span /></div>
        <span className="splash-caption">Conhe&#xE7;a <b>&#8226;</b> Conecte-se <b>&#8226;</b> Perten&#xE7;a</span>
      </motion.div>
    </div>
  );
}
