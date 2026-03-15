import { TrendingUp, TrendingDown } from "lucide-react";

interface BullBearCardsProps {
  bullCase: string;
  bearCase: string;
  confidence: "high" | "medium" | "low";
  modelUsed?: string;
  confidenceScore?: number;
  finalAssessment?: string;
}

const CONFIDENCE_SCORES: Record<string, number> = {
  high: 85,
  medium: 55,
  low: 25,
};

export function BullBearCards({ bullCase, bearCase, confidence, confidenceScore, finalAssessment }: BullBearCardsProps) {
  // Strip leading bullets: ASCII dash, Unicode bullet (•), triangular bullet (‣), middle dot (·), em dash (—), asterisk
  const stripBullet = (s: string) => s.replace(/^[\s\-–—•‣·*]+\s*/, '').trim();
  const bullPoints = bullCase.split(/\n/).map(stripBullet).filter(Boolean);
  const bearPoints = bearCase.split(/\n/).map(stripBullet).filter(Boolean);

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
          <ul className="space-y-1.5">
            {bullPoints.map((point, i) => (
              <li key={`bull-${i}`} className="text-sm text-muted-foreground leading-snug">
                • {point}
              </li>
            ))}
          </ul>
        </div>

        {/* Bear Case */}
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="h-4 w-4 text-red-500" />
            <span className="text-xs font-semibold uppercase tracking-wider text-red-500">
              Bear Case
            </span>
          </div>
          <ul className="space-y-1.5">
            {bearPoints.map((point, i) => (
              <li key={`bear-${i}`} className="text-sm text-muted-foreground leading-snug">
                • {point}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Confidence bar */}
      <div className="px-1 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            Analysis Confidence
          </span>
          <span
            className="text-xs font-semibold"
            style={{ color: scoreColor }}
          >
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
