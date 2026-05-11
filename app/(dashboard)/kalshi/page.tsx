import { Clock3, DatabaseZap, Scale } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { KalshiPredictionBoard } from "@/components/kalshi/kalshi-prediction-board";
import { getKalshiCommodityCalibrationData } from "@/lib/queries/kalshi-commodities";
import { getThesisBoardData } from "@/lib/queries/thesis-board";

export const dynamic = "force-dynamic";

function formatDateTime(value: string | null): string {
  if (!value) return "Not stamped";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Edmonton",
    timeZoneName: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default async function KalshiPage() {
  const thesisData = await getThesisBoardData();
  const kalshiData = await getKalshiCommodityCalibrationData(thesisData.comparisonRows);

  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-12 pt-8">
      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div>
          <Badge variant="outline" className="mb-4 border-canola/35 bg-canola/8 text-canola">
            Live commodity calibration
          </Badge>
          <h1 className="max-w-4xl font-display text-3xl font-semibold tracking-normal text-foreground md:text-5xl">
            Live Kalshi Commodity Insight
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
            Corn, soybeans, and wheat Kalshi probabilities compared against the
            Bushel Board Implied Line. The line is built from current thesis direction,
            confidence, and ranked evidence without writing back into the thesis model.
          </p>
        </div>

        <Card className="rounded-lg border-canola/25 bg-canola/8 py-5 shadow-none">
          <CardHeader className="px-5">
            <CardTitle className="flex items-center gap-2 text-base">
              <Scale className="h-4 w-4 text-canola" />
              Board contract
            </CardTitle>
            <CardDescription>
              Snapshot {formatDateTime(kalshiData.capturedAt)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 px-5 text-sm leading-6 text-muted-foreground">
            <p>Kalshi YES is the live market side when a supported market is active.</p>
            <p>Bushel Board Implied Line is deterministic and evidence-backed.</p>
            <p>Spread and liquidity are trust warnings, not proof of correctness.</p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="rounded-lg py-5 shadow-none">
          <CardHeader className="px-5">
            <CardDescription className="text-xs font-semibold uppercase tracking-wide">
              Kalshi Markets
            </CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums">
              {kalshiData.marketCount}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 text-sm leading-6 text-muted-foreground">
            Active markets returned from {kalshiData.watchedSeriesCount} watched
            corn, soybean, and wheat series.
          </CardContent>
        </Card>

        <Card className="rounded-lg py-5 shadow-none">
          <CardHeader className="px-5">
            <CardDescription className="text-xs font-semibold uppercase tracking-wide">
              Source State
            </CardDescription>
            <CardTitle className="text-2xl font-semibold capitalize">
              {kalshiData.sourceStatus.replace(/_/g, " ")}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 text-sm leading-6 text-muted-foreground">
            No active-market states stay visible. The page does not substitute mock
            probabilities.
          </CardContent>
        </Card>

        <Card className="rounded-lg py-5 shadow-none">
          <CardHeader className="px-5">
            <CardDescription className="text-xs font-semibold uppercase tracking-wide">
              Thesis Spine
            </CardDescription>
            <CardTitle className="text-2xl font-semibold">
              {thesisData.packetMode === "cached" ? "Cached" : "Live"}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 text-sm leading-6 text-muted-foreground">
            The implied line reads the same Canada/US thesis board packets used by
            the Bull/Bear Thesis Board.
          </CardContent>
        </Card>

        <Card className="rounded-lg py-5 shadow-none">
          <CardHeader className="px-5">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock3 className="h-4 w-4 text-canola" />
              Thesis timestamp
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 px-5 text-sm leading-6 text-muted-foreground">
            <p>{formatDateTime(thesisData.generatedAt)}</p>
            {thesisData.sourceRunWatermark && (
              <p className="flex items-center gap-2">
                <DatabaseZap className="h-3.5 w-3.5 text-canola" />
                Source run {formatDateTime(thesisData.sourceRunWatermark)}
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      <KalshiPredictionBoard data={kalshiData} />
    </div>
  );
}
