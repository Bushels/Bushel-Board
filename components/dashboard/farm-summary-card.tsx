import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles } from "lucide-react";
import type { FarmSummary } from "@/lib/queries/intelligence";

interface FarmSummaryCardProps {
  summary: FarmSummary | null;
}

export function FarmSummaryCard({ summary }: FarmSummaryCardProps) {
  if (!summary) {
    return (
      <Card className="border-dashed border-canola/30 bg-canola/5">
        <CardContent className="py-8 text-center">
          <Sparkles className="h-8 w-8 text-canola mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            Your personalized farm summary will appear here after the next weekly data update.
            Log deliveries in your active crops to get started.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-canola/20 bg-gradient-to-br from-canola/5 to-transparent">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-display flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-canola" />
          Your Weekly Farm Summary
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Week {summary.grain_week} · {summary.crop_year}
        </p>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-relaxed text-foreground/90">
          {summary.summary_text}
        </p>
      </CardContent>
    </Card>
  );
}
