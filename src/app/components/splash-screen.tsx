import { useEffect, useRef, useState } from "react";
import { BrandMark } from "./brand-mark";

type SplashScreenProps = {
  ready?: boolean;
  onExiting?: () => void;
  onFinished?: () => void;
};

/**
 * The launch timeline deliberately matches the approved Splash → Login asset:
 * focus-in on mount, begin leaving at 2.25 s, and hand the screen to login at
 * 3 s.  A slow session check may extend this state, but never causes a second
 * splash to be mounted later in the auth flow.
 */
export function SplashScreen({ ready = false, onExiting, onFinished }: SplashScreenProps) {
  const mountedAt = useRef(performance.now());
  const finishNotified = useRef(false);
  const exitTimer = useRef<number | undefined>(undefined);
  const finishTimer = useRef<number | undefined>(undefined);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!ready || leaving || finishNotified.current) return;

    const remainingBeforeExit = Math.max(0, 2250 - (performance.now() - mountedAt.current));
    exitTimer.current = window.setTimeout(() => {
      setLeaving(true);
      onExiting?.();
      finishTimer.current = window.setTimeout(() => {
        if (finishNotified.current) return;
        finishNotified.current = true;
        onFinished?.();
      }, 750);
    }, remainingBeforeExit);

    return () => {
      if (exitTimer.current) window.clearTimeout(exitTimer.current);
    };
  }, [leaving, onExiting, onFinished, ready]);

  useEffect(() => () => {
    if (exitTimer.current) window.clearTimeout(exitTimer.current);
    if (finishTimer.current) window.clearTimeout(finishTimer.current);
  }, []);

  return (
    <section className={`splash-screen ${leaving ? "is-leaving" : ""}`} role="status" aria-label="Abrindo ORHA">
      <div className="splash-content">
        <BrandMark className="splash-logo" />
        <p className="splash-caption">Conheça <span>•</span> Conecte-se <span>•</span> Pertença</p>
      </div>
    </section>
  );
}

