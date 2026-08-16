import { useEffect, useRef, useState } from "react";

type WelcomeScreenProps = {
  onFinished: () => void;
};

/**
 * Post-auth acknowledgement. Its timings deliberately match the approved
 * Splash → Login → Bem-Vindo reference flow.
 */
export function WelcomeScreen({ onFinished }: WelcomeScreenProps) {
  const [leaving, setLeaving] = useState(false);
  const notified = useRef(false);

  useEffect(() => {
    const leaveTimer = window.setTimeout(() => setLeaving(true), 3400);
    const finishTimer = window.setTimeout(() => {
      if (notified.current) return;
      notified.current = true;
      onFinished();
    }, 4000);

    return () => {
      window.clearTimeout(leaveTimer);
      window.clearTimeout(finishTimer);
    };
  }, [onFinished]);

  return (
    <main className={`welcome-screen ${leaving ? "is-leaving" : ""}`} aria-label="Boas-vindas">
      <h1>Bem-Vindo</h1>
    </main>
  );
}
