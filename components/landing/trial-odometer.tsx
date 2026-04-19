"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

const DIGITS = 6;
const DRUM_H = 64;

export type TrialOdometerHandle = {
  rollTo: (value: number) => void;
};

interface Props {
  initialValue: number;
}

export const TrialOdometer = forwardRef<TrialOdometerHandle, Props>(
  function TrialOdometer({ initialValue }, ref) {
    const stripRefs = useRef<(HTMLDivElement | null)[]>([]);
    const currentRef = useRef<number>(clampAcres(initialValue));
    const drumCurrents = useRef<number[]>(Array(DIGITS).fill(0));

    useImperativeHandle(ref, () => ({
      rollTo: (value: number) => rollTo(value),
    }));

    useEffect(() => {
      setDigitsImmediate(currentRef.current);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function setDigitsImmediate(value: number) {
      const s = String(clampAcres(value)).padStart(DIGITS, "0");
      for (let i = 0; i < DIGITS; i++) {
        const digit = Number.parseInt(s[i]!, 10);
        drumCurrents.current[i] = digit;
        const strip = stripRefs.current[i];
        if (!strip) continue;
        strip.style.transition = "none";
        strip.style.transform = `translateY(${-digit * DRUM_H}px)`;
      }
      void stripRefs.current[0]?.offsetHeight;
    }

    function rollTo(newValue: number) {
      const from = currentRef.current;
      const to = clampAcres(newValue);
      if (to === from) return;
      currentRef.current = to;

      const fromStr = String(from).padStart(DIGITS, "0");
      const toStr = String(to).padStart(DIGITS, "0");
      const baseDuration = 1800;
      const upward = to > from;

      for (let i = 0; i < DIGITS; i++) {
        const fromD = Number.parseInt(fromStr[i]!, 10);
        const toD = Number.parseInt(toStr[i]!, 10);
        let ticks: number;
        if (upward) {
          ticks = (toD - fromD + 10) % 10;
          if (ticks === 0 && fromD !== toD) ticks = 10;
        } else {
          ticks = (fromD - toD + 10) % 10;
        }
        const colFromRight = DIGITS - 1 - i;
        const extraSpins = Math.max(0, 3 - colFromRight);
        const totalTicks = ticks + extraSpins * 10;
        const delay = (DIGITS - 1 - colFromRight) * 40;
        const duration = baseDuration + colFromRight * 220;
        animateColumn(i, fromD, totalTicks, duration, delay);
      }
    }

    function animateColumn(
      i: number,
      fromD: number,
      totalTicks: number,
      duration: number,
      delay: number,
    ) {
      const strip = stripRefs.current[i];
      if (!strip) return;
      const startY = -fromD * DRUM_H;
      const endY = -(fromD + totalTicks) * DRUM_H;
      strip.style.transition = "none";
      strip.style.transform = `translateY(${startY}px)`;
      void strip.offsetHeight;

      window.setTimeout(() => {
        strip.style.transition = `transform ${duration}ms cubic-bezier(.18,.85,.2,1.02)`;
        strip.style.transform = `translateY(${endY}px)`;
        window.setTimeout(() => {
          const finalD = (((fromD + totalTicks) % 10) + 10) % 10;
          strip.style.transition = "none";
          strip.style.transform = `translateY(${-finalD * DRUM_H}px)`;
          drumCurrents.current[i] = finalD;
        }, duration + 30);
      }, delay);
    }

    return (
      <div className="odometer-wrap" aria-label="2026 trial acres enrolled">
        <div className="tape tape-odo">
          <span>2026 Trial Acres Enrolled</span>
        </div>
        <div className="odometer" role="status" aria-live="polite">
          <div className="odo-bezel">
            <div className="odo-glass">
              <div className="odo-digits">
                {Array.from({ length: DIGITS }).map((_, i) => (
                  <div key={i} className="odo-drum">
                    <div
                      className="odo-strip"
                      ref={(el) => {
                        stripRefs.current[i] = el;
                      }}
                    >
                      {Array.from({ length: 11 }).map((_, n) => (
                        <span key={n}>{n % 10}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="odo-glare" />
            </div>
            <div className="odo-screw tl" />
            <div className="odo-screw tr" />
            <div className="odo-screw bl" />
            <div className="odo-screw br" />
          </div>
          <div className="odo-caption">ACRES · EST. 2026</div>
        </div>
      </div>
    );
  },
);

function clampAcres(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(999_999, Math.floor(v)));
}
