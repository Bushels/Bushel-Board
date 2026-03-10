"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Gauge } from "lucide-react";
import type { DeliveryAnalytics } from "@/lib/queries/delivery-analytics";
import type { CropPlan } from "@/lib/queries/crop-plans";

interface DeliveryPaceCardProps {
  plans: CropPlan[];
  percentiles: Record<string, number>;
  analytics: DeliveryAnalytics[];
}

function getPaceBadge(percentile: number) {
  if (percentile >= 75) return { label: "Leading the pack", className: "bg-prairie/10 text-prairie" };
  if (percentile >= 25) return { label: "On pace", className: "bg-canola/10 text-canola" };
  return { label: "Room to go", className: "bg-amber-500/10 text-amber-600" };
}

/**
 * Shows the farmer's delivery pace compared to anonymized peer data.
 * Only renders for grains with >= 5 farmers (privacy threshold enforced by RPC).
 */
export function DeliveryPaceCard({ plans, percentiles, analytics }: DeliveryPaceCardProps) {
  const analyticsMap = new Map(analytics.map((a) => [a.grain, a]));

  // Filter to grains where we have both user percentile AND enough community data
  const visibleGrains = plans.filter(
    (p) => percentiles[p.grain] !== undefined && analyticsMap.has(p.grain)
  );

  if (visibleGrains.length === 0) return null;

  return (
    <Card className="border-canola/20 bg-gradient-to-br from-background to-canola/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-display flex items-center gap-2">
          <Gauge className="h-5 w-5 text-canola" />
          Your Delivery Pace
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {visibleGrains.map((plan) => {
          const percentile = Math.round(percentiles[plan.grain]);
          const ag = analyticsMap.get(plan.grain)!;
          const totalDelivered = (plan.deliveries || []).reduce((s, d) => s + d.amount_kt, 0);
          const totalVolume = plan.volume_left_to_sell_kt ?? 0;
          const deliveredPct = totalVolume > 0 ? Math.min(100, (totalDelivered / totalVolume) * 100) : 0;
          const badge = getPaceBadge(percentile);

          return (
            <div key={plan.grain} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-display font-semibold text-sm">{plan.grain}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badge.className}`}>
                  {badge.label}
                </span>
              </div>

              {/* Percentile gauge */}
              <div className="relative h-3 rounded-full bg-muted overflow-visible">
                {/* Quartile ticks */}
                {[25, 50, 75].map((tick) => (
                  <div
                    key={tick}
                    className="absolute top-0 h-3 w-px bg-border"
                    style={{ left: `${tick}%` }}
                  />
                ))}
                {/* User position dot */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-prairie border-2 border-background shadow-sm transition-all duration-500"
                  style={{ left: `${Math.min(98, Math.max(2, percentile))}%`, transform: "translate(-50%, -50%)" }}
                />
              </div>

              <p className="text-xs text-muted-foreground">
                You&apos;ve delivered{" "}
                <span className="font-semibold text-foreground">{deliveredPct.toFixed(0)}%</span>
                {" "}of your planned volume — faster than{" "}
                <span className="font-semibold text-prairie">{percentile}%</span>
                {" "}of {ag.farmer_count} farmers
              </p>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
