import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MapPin } from "lucide-react";

import { clearAreaFsa, setAreaFsa } from "@/app/(dashboard)/thesis/area-actions";
import type { AreaBid, ProvincialGrainFlow } from "@/lib/queries/area-read-utils";
import { describeSeasonPace } from "@/lib/queries/area-read-utils";
import type { AreaInfo } from "@/lib/utils/area";

const GRAIN_DISPLAY: Record<string, string> = { "Amber Durum": "Durum" };

function formatKt(value: number | null): string {
  if (value === null) return "n/a";
  return `${value.toLocaleString("en-CA", { maximumFractionDigits: 1 })} kt`;
}

function paceClass(yoy: number | null): string {
  if (yoy === null) return "text-muted-foreground";
  if (yoy > 2) return "text-prairie";
  if (yoy < -2) return "text-amber-700 dark:text-amber-400";
  return "text-muted-foreground";
}

function formatBid(bid: AreaBid): string {
  const price = bid.pricePerTonne === null ? "price on request" : `$${bid.pricePerTonne.toFixed(2)}/t`;
  const gap = bid.basis === null ? "" : ` (local price gap ${bid.basis > 0 ? "+" : ""}${bid.basis.toFixed(2)})`;
  return `${price}${gap}`;
}

function AreaEntryForm({ compact }: { compact: boolean }) {
  return (
    <form action={setAreaFsa} className="flex flex-wrap items-center gap-2">
      <label htmlFor="area-postal" className="sr-only">
        Postal code
      </label>
      <input
        id="area-postal"
        name="postal"
        placeholder="Postal code (e.g. T0L)"
        maxLength={7}
        autoComplete="postal-code"
        className="h-9 w-44 rounded-md border border-border bg-background px-3 text-sm"
      />
      <Button type="submit" size="sm" variant="outline">
        {compact ? "Update" : "Show my area"}
      </Button>
    </form>
  );
}

export function YourAreaCard({
  area,
  flows,
  grainWeek,
  bids,
}: {
  area: AreaInfo | null;
  flows: ProvincialGrainFlow[];
  grainWeek: number | null;
  bids: AreaBid[];
}) {
  return (
    <Card className="rounded-lg border-border bg-card py-4 shadow-none">
      <CardHeader className="gap-2 px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 font-display text-xl">
              <MapPin className="h-5 w-5 text-canola" aria-hidden="true" />
              Your area
            </CardTitle>
            <CardDescription className="mt-1 max-w-3xl text-sm leading-6">
              {area
                ? `Local context for ${area.fsa}${area.provinceName ? ` (${area.provinceName})` : ""}. Saved on this device only.`
                : "Enter your postal code to see your province's grain movement and any prices posted near you. Saved on this device only - no account needed."}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {area ? (
              <>
                <AreaEntryForm compact />
                <form action={clearAreaFsa}>
                  <Button type="submit" size="sm" variant="ghost">
                    Clear
                  </Button>
                </form>
              </>
            ) : (
              <AreaEntryForm compact={false} />
            )}
          </div>
        </div>
      </CardHeader>

      {area && (
        <CardContent className="space-y-4 px-5">
          {area.provinceName ? (
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold">{area.provinceName} elevator deliveries</p>
                {grainWeek !== null && (
                  <Badge variant="outline" className="border-border bg-muted/40 text-muted-foreground tabular-nums">
                    CGC week {grainWeek}
                  </Badge>
                )}
              </div>
              {flows.length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {flows.map((flow) => (
                    <div key={flow.grain} className="rounded-md border border-border bg-background p-3">
                      <p className="text-sm font-semibold">{GRAIN_DISPLAY[flow.grain] ?? flow.grain}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {formatKt(flow.weekKt)} this week &middot; {formatKt(flow.seasonKt)} this season
                      </p>
                      <p className={`mt-1 text-xs font-medium ${paceClass(flow.seasonYoyPct)}`}>
                        {describeSeasonPace(flow)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No provincial delivery rows for the current week yet. Check back after Thursday&apos;s CGC update.
                </p>
              )}
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Province-level CGC data: how hard farmers in your province are hauling each grain compared to last
                season. Heavy movement can mean lineups and wider local price gaps; light movement can mean room.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              That postal code is outside the prairie provinces this board covers (AB, SK, MB, BC), so there is no
              provincial movement read for it yet.
            </p>
          )}

          <div>
            <p className="mb-2 text-sm font-semibold">Prices posted near you</p>
            {bids.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {bids.slice(0, 6).map((bid, index) => (
                  <div key={`${bid.facilityName}-${bid.grain}-${index}`} className="rounded-md border border-border bg-background p-3">
                    <p className="text-sm font-semibold">
                      {GRAIN_DISPLAY[bid.grain] ?? bid.grain} &middot; {formatBid(bid)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {bid.facilityName ?? bid.businessType}
                      {bid.deliveryPeriod ? ` · ${bid.deliveryPeriod}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No elevator or processor prices are posted for your area yet. Operators post daily bids here as they
                join the board - check back, or tell your local elevator about Bushel Board.
              </p>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
