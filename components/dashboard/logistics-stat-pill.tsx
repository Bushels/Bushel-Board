import type { PillSentiment } from "@/lib/queries/logistics-utils";

interface LogisticsStatPillProps {
  label: string;
  value: string | number;
  unit?: string;
  sentiment: PillSentiment;
  sublabel?: string;
}

const SENTIMENT_STYLES: Record<PillSentiment, { border: string; text: string }> = {
  positive: {
    border: "border-prairie/40",
    text: "text-prairie",
  },
  negative: {
    border: "border-destructive/40",
    text: "text-destructive",
  },
  neutral: {
    border: "border-amber-500/40",
    text: "text-amber-500",
  },
};

export function LogisticsStatPill({
  label,
  value,
  unit,
  sentiment,
  sublabel,
}: LogisticsStatPillProps) {
  const style = SENTIMENT_STYLES[sentiment];

  return (
    <div
      className={`rounded-xl border bg-card/60 px-4 py-2.5 text-center backdrop-blur-sm ${style.border}`}
    >
      <p className={`font-display text-lg font-bold tabular-nums ${style.text}`}>
        {value}
        {unit && (
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            {unit}
          </span>
        )}
      </p>
      <p className="text-[0.6rem] font-medium uppercase tracking-[1.5px] text-muted-foreground">
        {label}
      </p>
      {sublabel && (
        <p className="mt-0.5 text-[0.55rem] text-muted-foreground/70">
          {sublabel}
        </p>
      )}
    </div>
  );
}
