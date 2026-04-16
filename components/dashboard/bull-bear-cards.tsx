import { TrendingUp, TrendingDown } from "lucide-react";

interface ReasoningRow {
  fact: string;
  reasoning: string;
}

interface BullBearCardsProps {
  bullCase: string;
  bearCase: string;
  confidence: "high" | "medium" | "low";
  modelUsed?: string;
  confidenceScore?: number;
  stanceScore?: number | null;
  finalAssessment?: string;
  // Structured reasoning for two-column layout
  bullReasoning?: Array<ReasoningRow> | null;
  bearReasoning?: Array<ReasoningRow> | null;
}

function getStanceLabel(score: number): string {
  if (score >= 70) return "Strongly Bullish";
  if (score >= 20) return "Bullish";
  if (score > -20) return "Neutral";
  if (score > -70) return "Bearish";
  return "Strongly Bearish";
}

function getStanceColor(score: number): string {
  if (score >= 20) return "#437a22";   // prairie green
  if (score > -20) return "#8b7355";   // wheat neutral
  return "#d97706";                     // amber/bearish
}

const CONFIDENCE_SCORES: Record<string, number> = {
  high: 85,
  medium: 55,
  low: 25,
};

function ReasoningTable({
  rows,
  variant,
}: {
  rows: Array<ReasoningRow>;
  variant: "bull" | "bear";
}) {
  const accentBorder =
    variant === "bull" ? "border-prairie/30" : "border-red-500/30";

  return (
    <div className="mt-2">
      {/* Header row */}
      <div className="hidden sm:grid grid-cols-2 gap-4 mb-2">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          What&rsquo;s Happening
        </span>
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Why It Matters
        </span>
      </div>

      {/* Data rows */}
      <div className="space-y-0">
        {rows.map((row, i) => (
          <div
            key={`${variant}-row-${i}`}
            className={`grid grid-cols-1 sm:grid-cols-2 gap-1 sm:gap-4 py-2.5 ${
              i < rows.length - 1 ? "border-b border-border/50" : ""
            }`}
          >
            {/* Fact */}
            <div className="text-sm font-medium text-foreground leading-snug">
              {row.fact}
            </div>
            {/* Reasoning — mobile gets left accent border */}
            <div
              className={`text-sm text-muted-foreground leading-snug sm:border-l-0 sm:pl-0 sm:mt-0 border-l-2 ${accentBorder} pl-3 mt-1`}
            >
              {row.reasoning}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BullBearCards({ bullCase, bearCase, confidence, confidenceScore, stanceScore, finalAssessment, bullReasoning, bearReasoning }: BullBearCardsProps) {
  // Strip leading bullets: ASCII dash, Unicode bullet (•), triangular bullet (‣), middle dot (·), em dash (—), asterisk
  const stripBullet = (s: string) => s.replace(/^[\s\-–—•‣·*]+\s*/, '').trim();
  const bullPoints = bullCase.split(/\n/).map(stripBullet).filter(Boolean);
  const bearPoints = bearCase.split(/\n/).map(stripBullet).filter(Boolean);

  const hasBullReasoning = bullReasoning && bullReasoning.length > 0;
  const hasBearReasoning = bearReasoning && bearReasoning.length > 0;

  // Use confidenceScore if provided, otherwise derive from confidence label
  const score = confidenceScore ?? CONFIDENCE_SCORES[confidence] ?? 50;
  const scoreColor =
    score >= 70 ? "#437a22" : score >= 40 ? "#c17f24" : "#d97706";
  const scoreLabel =
    score >= 70 ? "High" : score >= 40 ? "Medium" : "Low";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Bull Case */}
        <div className="rounded-lg border border-prairie/20 bg-prairie/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-prairie" />
            <span className="text-xs font-semibold uppercase tracking-wider text-prairie">
              Bull Case
            </span>
          </div>
          {hasBullReasoning ? (
            <ReasoningTable rows={bullReasoning} variant="bull" />
          ) : (
            <ul className="space-y-1.5">
              {bullPoints.map((point, i) => (
                <li key={`bull-${i}`} className="text-sm text-muted-foreground leading-snug">
                  • {point}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Bear Case */}
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="h-4 w-4 text-red-500" />
            <span className="text-xs font-semibold uppercase tracking-wider text-red-500">
              Bear Case
            </span>
          </div>
          {hasBearReasoning ? (
            <ReasoningTable rows={bearReasoning} variant="bear" />
          ) : (
            <ul className="space-y-1.5">
              {bearPoints.map((point, i) => (
                <li key={`bear-${i}`} className="text-sm text-muted-foreground leading-snug">
                  • {point}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Stance spectrum meter or confidence bar fallback */}
      {stanceScore != null ? (
        <div className="px-1 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-prairie">
              Bullish
            </span>
            <span className="text-xs text-muted-foreground">Neutral</span>
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-600">
              Bearish
            </span>
          </div>
          <div
            className="relative h-3 w-full rounded-full overflow-hidden"
            style={{
              background: "linear-gradient(to right, #437a22, #8b7355 50%, #d97706)",
            }}
          >
            <div
              className="absolute top-0 h-full w-1 rounded-full bg-foreground shadow-md transition-all duration-700"
              style={{
                left: `${Math.max(1, Math.min(99, 50 - stanceScore / 2))}%`,
                transform: "translateX(-50%)",
              }}
            />
          </div>
          <div className="flex justify-center">
            <span
              className="text-xs font-semibold"
              style={{ color: getStanceColor(stanceScore) }}
            >
              {stanceScore > 0 ? "+" : ""}{stanceScore} — {getStanceLabel(stanceScore)}
            </span>
          </div>
        </div>
      ) : (
        <div className="px-1 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Analysis Confidence
            </span>
            <span className="text-xs font-semibold" style={{ color: scoreColor }}>
              {scoreLabel} ({score}%)
            </span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-muted/40 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${Math.max(0, Math.min(100, score))}%`,
                backgroundColor: scoreColor,
              }}
            />
          </div>
        </div>
      )}

      {/* Final assessment callout */}
      {finalAssessment && (
        <div className="rounded-lg border border-canola/20 bg-canola/10 p-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Assessment
          </span>
          <p className="mt-1 text-sm text-foreground leading-snug">
            {finalAssessment}
          </p>
        </div>
      )}
    </div>
  );
}
