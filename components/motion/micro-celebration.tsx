"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useCallback, useEffect, type ReactNode } from "react";

const CELEBRATION_KEYS = {
  firstVote: "bb_first_vote",
  firstDelivery: "bb_first_delivery",
  firstCrop: "bb_first_crop",
  firstSignalVote: "bb_first_signal_vote",
} as const;

export type CelebrationType = keyof typeof CELEBRATION_KEYS;

/**
 * Hook that tracks first-time actions via localStorage.
 * Returns a trigger function and active state.
 */
export function useCelebration(type: CelebrationType) {
  const [isActive, setIsActive] = useState(false);

  const trigger = useCallback(() => {
    const key = CELEBRATION_KEYS[type];
    if (typeof window === "undefined") return;
    if (localStorage.getItem(key)) return; // Already celebrated

    localStorage.setItem(key, "1");
    setIsActive(true);

    // Auto-dismiss after animation
    setTimeout(() => setIsActive(false), 800);
  }, [type]);

  return { trigger, isActive };
}

/**
 * Wraps a child element with a subtle golden glow pulse on first-time trigger.
 * Uses canola color for the glow effect.
 */
export function MicroCelebration({
  children,
  isActive,
}: {
  children: ReactNode;
  isActive: boolean;
}) {
  return (
    <div className="relative">
      {children}
      <AnimatePresence>
        {isActive && (
          <motion.div
            className="absolute inset-0 rounded-lg pointer-events-none"
            initial={{ opacity: 0, scale: 1 }}
            animate={{
              opacity: [0, 0.6, 0],
              scale: [1, 1.05, 1],
              boxShadow: [
                "0 0 0 0 rgba(193, 127, 36, 0)",
                "0 0 20px 4px rgba(193, 127, 36, 0.3)",
                "0 0 0 0 rgba(193, 127, 36, 0)",
              ],
            }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            exit={{ opacity: 0 }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
