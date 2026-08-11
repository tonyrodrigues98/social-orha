import { motion, useReducedMotion } from "motion/react";
import { BrandMark } from "./brand-mark";

export function SplashScreen() {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className="splash-screen"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: reduceMotion ? 1 : 1.015 }}
      transition={{ duration: reduceMotion ? 0 : 0.42, ease: "easeInOut" }}
      role="status"
      aria-label="Abrindo ORHA"
    >
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 10, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.58, ease: [0.22, 1, 0.36, 1] }}
      >
        <BrandMark className="splash-logo" />
      </motion.div>
      <span className="splash-caption">Gente de verdade. Vínculos de verdade.</span>
    </motion.div>
  );
}
