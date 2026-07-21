import { AnimatePresence, motion } from "framer-motion";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import type { PlayerRoundStatus } from "../../types/game";

export interface PlayerStatusIndicatorProps {
  status: PlayerRoundStatus;
}

export function PlayerStatusIndicator({ status }: PlayerStatusIndicatorProps) {
  const [dotCount, setDotCount] = useState(1);

  useEffect(() => {
    if (status !== "thinking") return;
    setDotCount(1);
    const timer = window.setInterval(() => setDotCount((current) => current % 3 + 1), 350);
    return () => window.clearInterval(timer);
  }, [status]);

  return (
    <span className="player-round-status">
      <span className="sr-only" aria-live="polite">{status === "submitted" ? "Answer locked." : "Waiting for answer."}</span>
      <AnimatePresence mode="wait" initial={false}>
        {status === "submitted" ? (
          <motion.span key="submitted" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} aria-hidden="true">
            <Check size={19} strokeWidth={1.8} />
          </motion.span>
        ) : (
          <motion.span key="thinking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="thinking-dots" aria-hidden="true">
            {".".repeat(dotCount)}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
