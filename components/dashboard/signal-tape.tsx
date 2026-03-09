"use client";

interface SignalTapeProps {
  signals: Array<{
    sentiment: string; // "bullish" | "bearish" | "neutral"
    category: string;
    post_summary: string;
    grain: string;
  }>;
}

const sentimentDotColor: Record<string, string> = {
  bullish: "bg-prairie",
  bearish: "bg-error",
  neutral: "bg-warning",
};

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + "\u2026";
}

export function SignalTape({ signals }: SignalTapeProps) {
  if (!signals || signals.length === 0) return null;

  // Duplicate signals for seamless loop
  const doubled = [...signals, ...signals];

  return (
    <div
      className="relative overflow-hidden bg-wheat-900 dark:bg-wheat-950 border-y border-wheat-700/40 py-2"
      aria-label="Market signal ticker"
    >
      <div className="animate-scroll-tape flex whitespace-nowrap gap-8 font-mono text-sm text-wheat-200">
        {doubled.map((s, i) => (
          <span
            key={`${s.grain}-${s.sentiment}-${i}`}
            className="inline-flex items-center gap-2 shrink-0"
          >
            <span
              className={`inline-block h-2 w-2 rounded-full ${sentimentDotColor[s.sentiment] ?? "bg-warning"}`}
            />
            <span className="font-bold">{s.grain}</span>
            <span className="opacity-80">
              {truncate(s.post_summary, 80)}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
