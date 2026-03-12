import { TrendingUp, TrendingDown } from "lucide-react";

interface BullBearCardsProps {
  bullCase: string;
  bearCase: string;
  confidence: "high" | "medium" | "low";
  modelUsed?: string;
}

export function BullBearCards({ bullCase, bearCase, confidence, modelUsed }: BullBearCardsProps) {
  // Strip leading bullets: ASCII dash, Unicode bullet (•), triangular bullet (‣), middle dot (·), em dash (—), asterisk
  const stripBullet = (s: string) => s.replace(/^[\s\-–—•‣·*]+\s*/, '').trim();
  const bullPoints = bullCase.split(/\n/).map(stripBullet).filter(Boolean);
  const bearPoints = bearCase.split(/\n/).map(stripBullet).filter(Boolean);

  const confidenceColors = {
    high: "text-prairie",
    medium: "text-canola",
    low: "text-muted-foreground",
  };

  return (
    <div className="space-y-3">
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

      {/* Attribution footer */}
      <div className="flex items-center justify-between text-[0.65rem] text-muted-foreground/60 px-1">
        <span className={confidenceColors[confidence]}>
          Confidence: {confidence}
        </span>
        {modelUsed && (
          <span>Analysis by {modelUsed} + Grok</span>
        )}
      </div>
    </div>
  );
}
