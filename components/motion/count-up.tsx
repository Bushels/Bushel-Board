"use client";

import { useEffect, useRef } from "react";
import {
  useInView,
  useMotionValue,
  useSpring,
  animate,
} from "framer-motion";

interface CountUpProps {
  target: number;
  duration?: number; // seconds, default 0.8
  format?: (value: number) => string;
  className?: string;
}

export function CountUp({
  target,
  duration = 0.8,
  format,
  className,
}: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const motionValue = useMotionValue(0);
  const springValue = useSpring(motionValue, { duration: duration * 1000 });

  useEffect(() => {
    if (inView) {
      animate(motionValue, target, { duration });
    }
  }, [inView, target, duration, motionValue]);

  useEffect(() => {
    const unsubscribe = springValue.on("change", (latest) => {
      if (ref.current) {
        ref.current.textContent = format
          ? format(Math.round(latest))
          : Math.round(latest).toLocaleString();
      }
    });
    return unsubscribe;
  }, [springValue, format]);

  // Respect prefers-reduced-motion: framer-motion handles this automatically
  return (
    <span ref={ref} className={className}>
      {format ? format(0) : "0"}
    </span>
  );
}
