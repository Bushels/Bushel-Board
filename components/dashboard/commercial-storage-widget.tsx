import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Factory, AreaChart } from "lucide-react";
import { fmtKt } from "@/lib/utils/format";

export function CommercialStorageWidget() {
  // Hardcoded mock values based on typical CGC parameters for aesthetics
  const primaryElevators = 6200.5;
  const terminalElevators = 2400.1;
  const totalCapacity = 10000;

  const primaryPct = (primaryElevators / totalCapacity) * 100;
  const terminalPct = (terminalElevators / totalCapacity) * 100;

  return (
    <Card className="h-full flex flex-col border-border/40 bg-card/60 backdrop-blur-xl shadow-xl hover:shadow-2xl transition-all duration-300 group">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2 font-display">
            <Factory className="h-4 w-4 text-muted-foreground" />
            Commercial Storage
          </CardTitle>
          <AreaChart className="h-4 w-4 text-muted-foreground opacity-50" />
        </div>
        <CardDescription>Current system handling capacity</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col justify-center space-y-6">
        
        {/* Primary Elevators */}
        <div>
          <div className="flex justify-between mb-1.5">
            <span className="text-sm font-medium">Primary Elevators</span>
            <span className="text-sm text-muted-foreground">{fmtKt(primaryElevators)}</span>
          </div>
          <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-amber-600 rounded-full transition-all duration-1000"
              style={{ width: `${primaryPct}%` }}
            />
          </div>
        </div>

        {/* Terminal Elevators */}
        <div>
          <div className="flex justify-between mb-1.5">
            <span className="text-sm font-medium">Terminal Elevators</span>
            <span className="text-sm text-muted-foreground">{fmtKt(terminalElevators)}</span>
          </div>
          <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-prairie rounded-full transition-all duration-1000 delay-300"
              style={{ width: `${terminalPct}%` }}
            />
          </div>
        </div>

        <div className="pt-4 mt-auto border-t border-border/50">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Total System Space</span>
            <span className="text-base font-display font-semibold">{fmtKt(totalCapacity, 0)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
