"use client";

import { useState, useEffect, useCallback } from "react";
import { useReducedMotion } from "framer-motion";

interface Props {
  weeks: string[]; // ISO date strings, ascending
  currentWeek: string;
  onChange: (weekEnding: string) => void;
}

export function SeedingScrubber({ weeks, currentWeek, onChange }: Props) {
  // framer-motion's useReducedMotion returns null on first render (server +
  // hydration), then true/false after mount. We treat null as "not reduced" so
  // the Replay button renders consistently between server and client first
  // render — no hydration mismatch — then disappears if the user actually has
  // reduced-motion enabled.
  const reducedMotion = useReducedMotion() === true;

  const currentIndex = Math.max(0, weeks.indexOf(currentWeek));

  const [playing, setPlaying] = useState(false);

  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(weeks[Number(e.target.value)]);
    },
    [weeks, onChange]
  );

  // Replay interval — skipped entirely when reduced-motion is active
  useEffect(() => {
    if (reducedMotion || !playing) return;

    const id = setInterval(() => {
      const next = weeks.indexOf(currentWeek) + 1;
      if (next >= weeks.length) {
        setPlaying(false);
        return;
      }
      onChange(weeks[next]);
    }, 600);

    return () => clearInterval(id);
  }, [playing, currentWeek, weeks, onChange, reducedMotion]);

  // Stop replay if we've reached the end
  useEffect(() => {
    if (playing && currentIndex >= weeks.length - 1) {
      setPlaying(false);
    }
  }, [currentIndex, playing, weeks.length]);

  const toggleReplay = () => {
    // If at the end, restart from the beginning
    if (!playing && currentIndex >= weeks.length - 1) {
      onChange(weeks[0]);
    }
    setPlaying((prev) => !prev);
  };

  return (
    <div className="mt-4 space-y-2">
      {/* Header row */}
      <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
        <span>Week ending {currentWeek}</span>
        {!reducedMotion && (
          <button
            type="button"
            onClick={toggleReplay}
            className="rounded-full border border-border/40 bg-card/80 px-3 py-1 text-xs font-medium hover:bg-card"
          >
            {playing ? "Pause" : "Replay season"}
          </button>
        )}
      </div>

      {/* Slider */}
      <input
        type="range"
        min={0}
        max={weeks.length - 1}
        step={1}
        value={currentIndex}
        onChange={handleSliderChange}
        aria-label="Select week"
        className="w-full accent-canola"
      />

      {/* Bottom label row */}
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{weeks[0]}</span>
        <span>{weeks[weeks.length - 1]}</span>
      </div>
    </div>
  );
}
