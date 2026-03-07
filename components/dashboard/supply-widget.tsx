import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { fmtKt } from "@/lib/utils/format";
import { CURRENT_CROP_YEAR } from "@/lib/utils/crop-year";
import { PackageOpen, Sprout } from "lucide-react";

interface MacroEstimate {
  production_kt: number;
  carry_over_kt: number;
}

export function SupplyWidget({ macro }: { macro: MacroEstimate | null }) {
  if (!macro) {
    return (
      <Card className="bg-card">
        <CardHeader>
          <CardTitle className="text-lg">Supply Estimates</CardTitle>
          <CardDescription>No {CURRENT_CROP_YEAR} data found.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const startingSupply = Number(macro.production_kt) + Number(macro.carry_over_kt || 0);

  return (
    <Card className="bg-card hover:border-canola/50 transition-colors">
      <CardHeader className="pb-3 border-b border-border/40">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg font-display">Starting Supply</CardTitle>
            <CardDescription>{CURRENT_CROP_YEAR} Estimates</CardDescription>
          </div>
          <PackageOpen className="h-5 w-5 text-canola" />
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="text-3xl font-display font-semibold mb-1">
          {fmtKt(startingSupply)}
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Total estimated pipeline availability.
        </p>

        <div className="space-y-3">
          <div className="flex justify-between items-center text-sm border-t border-border/20 pt-3">
            <span className="flex items-center gap-2 text-muted-foreground">
              <Sprout className="h-4 w-4" /> Production
            </span>
            <span className="font-medium">{fmtKt(Number(macro.production_kt))}</span>
          </div>
          <div className="flex justify-between items-center text-sm border-t border-border/20 pt-3">
            <span className="text-muted-foreground ml-6">Est. Carry-over</span>
            <span className="font-medium">{fmtKt(Number(macro.carry_over_kt))}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
