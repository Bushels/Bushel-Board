import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { fmtKt } from "@/lib/utils/format";
import { Truck } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { RegionValue } from "@/lib/queries/observations";

export function FlowBreakdownWidget({ distribution, totalDeliveries }: { distribution: RegionValue[], totalDeliveries: number }) {

  // Aggregate common disappearance channels
  let exportsAmount = 0;
  let crushAmount = 0;
  let otherAmount = 0;

  for (const item of distribution) {
    const typeStr = item.region || "";
    if (typeStr.includes("Export") || typeStr.includes("Pacific") || typeStr.includes("Thunder") || typeStr.includes("Atlantic")) {
      exportsAmount += Number(item.ktonnes || 0);
    } else if (typeStr.includes("Crush") || typeStr.includes("Process") || typeStr.includes("Domestic")) {
      crushAmount += Number(item.ktonnes || 0);
    } else {
      otherAmount += Number(item.ktonnes || 0);
    }
  }

  const domesticDisappearance = crushAmount + otherAmount;
  const totalDisappearance = domesticDisappearance + exportsAmount;

  const deliveryPct = totalDeliveries > 0 ? (totalDisappearance / totalDeliveries) * 100 : 0;

  return (
    <Card className="bg-card hover:border-canola/50 transition-colors">
      <CardHeader className="pb-3 border-b border-border/40">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg font-display">Flow Breakdown</CardTitle>
            <CardDescription>Deliveries vs. Disappearance (YTD)</CardDescription>
          </div>
          <Truck className="h-5 w-5 text-canola" />
        </div>
      </CardHeader>
      <CardContent className="pt-4">

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm font-medium text-success">Producer Deliveries</span>
              <span className="font-semibold">{fmtKt(totalDeliveries)}</span>
            </div>
            <Progress value={100} className="h-2 bg-muted [&>div]:bg-success" />
          </div>

          <div className="space-y-2 pt-2">
            <div className="flex justify-between">
              <span className="text-sm font-medium text-warning">Total Disappearance</span>
              <span className="font-semibold">{fmtKt(totalDisappearance)}</span>
            </div>
            <Progress value={Math.min(deliveryPct, 100)} className="h-2 bg-muted [&>div]:bg-warning" />
          </div>

          <div className="grid grid-cols-2 gap-4 mt-2 border-t border-border/20 pt-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Exports</p>
              <p className="text-sm font-medium">{fmtKt(exportsAmount)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Dom. Processing</p>
              <p className="text-sm font-medium">{fmtKt(crushAmount)}</p>
            </div>
          </div>
        </div>

      </CardContent>
    </Card>
  );
}
