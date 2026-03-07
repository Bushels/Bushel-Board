import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtKt, fmtPct } from "@/lib/utils/format";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

interface PipelineCardProps {
  grain: string;
  slug: string;
  cyDeliveries: number;
  cwDeliveries: number;
  wowChange: number;
}

export function PipelineCard({
  grain,
  slug,
  cyDeliveries,
  cwDeliveries,
  wowChange,
}: PipelineCardProps) {
  const isPositive = wowChange >= 0;
  
  // Create a pseudo-progress based on typical delivery caps just for visualization
  const maxCap = 25000;
  const deliveryPct = Math.min((cyDeliveries / maxCap) * 100, 100);

  return (
    <Link href={`/grain/${slug}`} className="block h-full group">
      <Card className="relative h-full overflow-hidden transition-all duration-500 hover:-translate-y-1 hover:shadow-2xl hover:shadow-canola/5 border-border/40 bg-card/40 backdrop-blur-md">
        <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        
        <CardHeader className="pb-3 border-b border-border/20 z-10 relative">
          <CardTitle className="text-lg font-display font-semibold flex items-start justify-between">
            <span>{grain}</span>
            <Badge
              variant="secondary"
              className={`flex items-center gap-0.5 ${isPositive ? "text-prairie bg-prairie/10" : "text-error bg-error/10"}`}
            >
              {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {fmtPct(wowChange)}
            </Badge>
          </CardTitle>
        </CardHeader>
        
        <CardContent className="space-y-4 pt-4 z-10 relative">
          <div className="flex justify-between items-baseline">
            <div className="flex flex-col">
              <span className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-1">Crop Year</span>
              <span className="text-2xl tabular-nums font-semibold tracking-tight">
                {fmtKt(cyDeliveries, 0)}
              </span>
            </div>
            <div className="flex flex-col text-right">
              <span className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-1">Week</span>
              <span className="text-lg tabular-nums font-medium text-muted-foreground">
                +{fmtKt(cwDeliveries)}
              </span>
            </div>
          </div>
          
          <div className="space-y-1.5 pt-2">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Pipeline Volume</span>
              <span>{Math.round(deliveryPct)}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden backdrop-blur-sm">
              <div
                className="h-full rounded-full bg-gradient-to-r from-canola to-amber-400 opacity-90 group-hover:opacity-100 transition-all duration-1000 ease-out"
                style={{ width: `${deliveryPct}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
