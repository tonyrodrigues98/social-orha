import { useEffect, useRef, useState } from "react";
import { BrandMark } from "./brand-mark";

type SplashScreenProps = {
  ready?: boolean;
  onFinished?: () => void;
};

/**
 * The launch timeline deliberately matches the approved Splash → Login asset:
 * focus-in on mount, remain fully legible through 2.6 s, and complete the
 * focus-out before handing the screen to login at 3 s. A slow session check
 * may extend this state, but never causes a second
 * splash to be mounted later in the auth flow.
 */
export function SplashScreen({ ready = false, onFinished }: SplashScreenProps) {
  const mountedAt = useRef<number | null>(null);
  const finishNotified = useRef(false);
  const exitTimer = useRef<number | undefined>(undefined);
  const finishTimer = useRef<number | undefined>(undefined);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!ready || leaving || finishNotified.current) return;

    mountedAt.current ??= performance.now();

    const remainingBeforeExit = Math.max(0, 2600 - (performance.now() - mountedAt.current));
    exitTimer.current = window.setTimeout(() => {
      setLeaving(true);
      finishTimer.current = window.setTimeout(() => {
        if (finishNotified.current) return;
        finishNotified.current = true;
        onFinished?.();
      }, 400);
    }, remainingBeforeExit);

    return () => {
      if (exitTimer.current) window.clearTimeout(exitTimer.current);
    };
  }, [leaving, onFinished, ready]);

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
