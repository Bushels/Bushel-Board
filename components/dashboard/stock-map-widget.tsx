import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { fmtKt } from "@/lib/utils/format";
import { Database, Home } from "lucide-react";
import type { StorageBreakdown } from "@/lib/queries/observations";

export function StockMapWidget({ storageData }: { storageData: StorageBreakdown[] }) {

  const primary = storageData.find(s => s.storage_type === "Primary Elevators")?.ktonnes ?? 0;
  const process = storageData.find(s => s.storage_type === "Process Elevators")?.ktonnes ?? 0;
  const terminal = storageData.find(s => s.storage_type === "Terminal Elevators")?.ktonnes ?? 0;
  const total = primary + process + terminal;

  if (total === 0) {
    return (
      <Card className="bg-card">
        <CardHeader>
          <CardTitle className="text-lg">Stock Map</CardTitle>
          <CardDescription>No storage data available.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="bg-card hover:border-canola/50 transition-colors">
      <CardHeader className="pb-3 border-b border-border/40">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg font-display">Stock Map</CardTitle>
            <CardDescription>Current System Holdings — {fmtKt(total)}</CardDescription>
          </div>
          <Database className="h-5 w-5 text-canola" />
        </div>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">

        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2 rounded-md">
            <Home className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1">
            <div className="flex justify-between text-sm">
              <span className="font-medium">Primary Elevators</span>
              <span>{fmtKt(primary)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-success/10 p-2 rounded-md">
            <Database className="h-4 w-4 text-success" />
          </div>
          <div className="flex-1">
            <div className="flex justify-between text-sm">
              <span className="font-medium">Terminal Elevators</span>
              <span>{fmtKt(terminal)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-warning/10 p-2 rounded-md">
            <Database className="h-4 w-4 text-warning" />
          </div>
          <div className="flex-1">
            <div className="flex justify-between text-sm">
              <span className="font-medium">Processors</span>
              <span>{fmtKt(process)}</span>
            </div>
          </div>
        </div>

      </CardContent>
    </Card>
  );
}
