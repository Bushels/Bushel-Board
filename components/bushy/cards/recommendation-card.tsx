import { ArrowRight } from "lucide-react";
import type { RecommendationData } from "../types";
import { TrustFooter } from "./trust-footer";

interface RecommendationCardProps {
  data: RecommendationData;
}

export function RecommendationCard({ data }: RecommendationCardProps) {
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-[0_4px_16px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.04)] dark:bg-wheat-900/80">
      {/* Headline */}
      <div className="px-3.5 pt-3.5">
        <h3 className="text-sm font-bold text-foreground">{data.headline}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{data.explanation}</p>
      </div>

      {/* Quick action buttons */}
      {data.actions.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3.5 pt-3">
          {data.actions.map((action, i) => (
            <button
              key={i}
              type="button"
              className="inline-flex items-center gap-1.5 rounded-xl bg-canola/10 px-3 py-2 text-xs font-medium text-canola transition-colors hover:bg-canola/20"
            >
              <ArrowRight className="h-3 w-3" />
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* Trust footer */}
      <div className="px-3.5 pb-3.5">
        <TrustFooter data={data.trustFooter} />
      </div>
    </div>
  );
}
