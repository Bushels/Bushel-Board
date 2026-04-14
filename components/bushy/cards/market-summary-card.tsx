import { Leaf } from "lucide-react";
import type { MarketSummaryData } from "../types";
import { SourceBadge } from "./source-badge";
import { TrustFooter } from "./trust-footer";

interface MarketSummaryCardProps {
  data: MarketSummaryData;
}

function stanceBadgeColor(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("bullish")) return "bg-prairie/15 text-prairie";
  if (lower.includes("bearish")) return "bg-red-500/15 text-red-600";
  return "bg-canola/15 text-canola";
}

export function MarketSummaryCard({ data }: MarketSummaryCardProps) {
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-[0_4px_16px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.04)] dark:bg-wheat-900/80">
      {/* Header: grain + stance badge */}
      <div className="flex items-center justify-between px-3.5 pb-2 pt-3.5">
        <div className="flex items-center gap-2">
          <Leaf className="h-4 w-4 text-canola" />
          <span className="text-sm font-bold text-foreground">{data.grain}</span>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-bold ${stanceBadgeColor(data.stanceBadge)}`}
        >
          {data.stanceBadge}
        </span>
      </div>

      <div className="mx-3.5 h-px bg-border/50" />

      {/* Takeaway */}
      <p className="px-3.5 pt-2.5 text-sm text-foreground">{data.takeaway}</p>

      {/* Reason bullets */}
      <div className="space-y-1.5 px-3.5 pt-2">
        {data.reasons.map((reason, i) => (
          <div key={i} className="flex items-start gap-1.5">
            <span className="mt-[7px] h-[5px] w-[5px] shrink-0 rounded-full bg-canola" />
            <span className="flex-1 text-sm text-foreground">{reason.text}</span>
            <SourceBadge tag={reason.sourceTag} />
          </div>
        ))}
      </div>

      {/* Recommendation */}
      <p className="px-3.5 pt-2.5 text-sm font-medium text-foreground">
        {data.recommendation}
      </p>

      {/* Follow-up ask */}
      {data.followUpAsk && (
        <p className="px-3.5 pt-1.5 text-sm italic text-muted-foreground">
          {data.followUpAsk}
        </p>
      )}

      {/* Trust footer */}
      <div className="px-3.5 pb-3.5">
        <TrustFooter data={data.trustFooter} />
      </div>
    </div>
  );
}
