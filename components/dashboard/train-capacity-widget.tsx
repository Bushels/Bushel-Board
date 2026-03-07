import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { TrainTrack } from "lucide-react";
import { fmtKt } from "@/lib/utils/format";

export function TrainCapacityWidget() {
  const carsOrdered = 8420;
  const carsUnloaded = 7110;
  
  // Approximate kt for car capacity
  const ktPerCar = 0.09; 
  const totalKtOrdered = carsOrdered * ktPerCar;
  const totalKtUnloaded = carsUnloaded * ktPerCar;
  const percentage = (carsUnloaded / carsOrdered) * 100;

  return (
    <Card className="h-full flex flex-col border-border/40 bg-card/60 backdrop-blur-xl shadow-xl hover:shadow-2xl transition-all duration-300">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2 font-display">
            <TrainTrack className="h-4 w-4 text-muted-foreground" />
            Rail Pipeline
          </CardTitle>
          <div className="flex gap-1.5 items-end">
            <div className="w-1 h-3 bg-prairie rounded-sm animate-pulse" />
            <div className="w-1 h-4 bg-prairie rounded-sm animate-pulse delay-75" />
            <div className="w-1 h-2 bg-prairie rounded-sm animate-pulse delay-150" />
          </div>
        </div>
        <CardDescription>Western grain car unloads vs orders</CardDescription>
      </CardHeader>
      
      <CardContent className="flex-1 flex flex-col justify-center space-y-5">
        <div className="flex items-center justify-center py-4 bg-muted/20 rounded-xl border border-dashed border-border/50">
          <div className="text-center">
            <div className="text-4xl font-display font-medium text-foreground">
              {Math.round(percentage)}<span className="text-xl text-muted-foreground">%</span>
            </div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mt-1">
              Fulfillment Rate
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider font-semibold">Ordered</div>
            <div className="text-xl font-medium tabular-nums">{carsOrdered.toLocaleString()} <span className="text-sm text-muted-foreground font-normal">cars</span></div>
            <div className="text-xs text-muted-foreground">~{fmtKt(totalKtOrdered, 0)} kt</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider font-semibold">Unloaded</div>
            <div className="text-xl font-medium tabular-nums">{carsUnloaded.toLocaleString()} <span className="text-sm text-muted-foreground font-normal">cars</span></div>
            <div className="text-xs text-muted-foreground">~{fmtKt(totalKtUnloaded, 0)} kt</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
