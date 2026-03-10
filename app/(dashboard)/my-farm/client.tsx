"use client";

import { useState } from "react";
import { addCropPlan, removeCropPlan } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2, Truck } from "lucide-react";
import Link from "next/link";

import { CURRENT_CROP_YEAR, cropYearLabel } from "@/lib/utils/crop-year";
import { LogDeliveryModal } from "@/components/dashboard/log-delivery-modal";
import type { CropPlan } from "@/lib/queries/crop-plans";
import type { UserRole } from "@/lib/auth/role-guard";

const AVAILABLE_GRAINS = [
  "Wheat", "Canola", "Amber Durum", "Barley", "Peas", "Oats", "Lentils",
  "Soybeans", "Flaxseed", "Mustard Seed", "Corn", "Rye", "Chick Peas",
  "Sunflower", "Canaryseed", "Beans",
];

const fmtT = (kt: number) => (kt * 1000).toLocaleString("en-CA", { maximumFractionDigits: 0 });

interface MyFarmClientProps {
  currentPlans: CropPlan[];
  percentiles: Record<string, number>;
  role?: UserRole;
}

export function MyFarmClient({ currentPlans, percentiles, role = "farmer" }: MyFarmClientProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deliveryGrain, setDeliveryGrain] = useState<string | null>(null);

  const isObserver = role === "observer";
  const unusedGrains = AVAILABLE_GRAINS.filter(
    (g) => !currentPlans.some((cp) => cp.grain === g)
  );

  async function handleAdd(formData: FormData) {
    setLoading(true);
    setError(null);
    const res = await addCropPlan(formData);
    if (res?.error) setError(res.error);
    setLoading(false);
  }

  async function handleRemove(grain: string) {
    setLoading(true);
    await removeCropPlan(grain);
    setLoading(false);
  }

  // Observer empty state
  if (isObserver) {
    return (
      <div className="text-center py-16 space-y-4">
        <div className="mx-auto w-16 h-16 rounded-full bg-canola/10 flex items-center justify-center">
          <Truck className="h-8 w-8 text-canola" />
        </div>
        <h3 className="text-xl font-display font-semibold">Observer Account</h3>
        <p className="text-muted-foreground max-w-md mx-auto">
          You&apos;re browsing as an observer. Switch to a farmer account to track crops,
          log deliveries, and unlock personalized intelligence.
        </p>
        <p className="text-xs text-muted-foreground">
          Contact support or re-register as a farmer to access these features.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 text-foreground">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        <div className="space-y-6">
          <h2 className="text-2xl font-display font-semibold">Active Crops</h2>
          {currentPlans.length === 0 ? (
            <p className="text-muted-foreground border border-dashed border-border rounded-xl p-8 text-center bg-card/40">
              No crops added for the {CURRENT_CROP_YEAR} season yet.
            </p>
          ) : (
            <div className="grid gap-4">
              {currentPlans.map((plan) => {
                const totalDelivered = (plan.deliveries || []).reduce((sum, d) => sum + d.amount_kt, 0);
                const totalVolume = plan.volume_left_to_sell_kt ?? 0;
                const contracted = Number(plan.contracted_kt ?? 0);
                const uncontracted = Number(plan.uncontracted_kt ?? 0);
                const deliveredPct = totalVolume > 0 ? Math.min(100, (totalDelivered / totalVolume) * 100) : 0;
                const contractedPct = totalVolume > 0 ? Math.min(100 - deliveredPct, (contracted / totalVolume) * 100) : 0;
                const uncontractedPct = Math.max(0, 100 - deliveredPct - contractedPct);

                return (
                  <Card key={plan.grain} className="bg-card/40 border-border/40 backdrop-blur-sm transition-all hover:bg-card hover:shadow-lg">
                    <CardHeader className="pb-3 border-b border-border/20 flex flex-row items-center justify-between space-y-0">
                      <div>
                        <CardTitle className="text-lg font-display">{plan.grain}</CardTitle>
                        <CardDescription>{cropYearLabel(CURRENT_CROP_YEAR, "Season")}</CardDescription>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => handleRemove(plan.grain)} disabled={loading} className="text-muted-foreground hover:text-error">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-3">
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Area Seeded</span>
                        <span className="font-semibold">{plan.acres_seeded.toLocaleString()} ac</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Est. Volume to Sell</span>
                        <span className="font-semibold">{fmtT(totalVolume)} t</span>
                      </div>

                      {/* Stacked progress bar: delivered / contracted / uncontracted */}
                      <div className="space-y-2 pt-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Delivered</span>
                          <span className="font-semibold text-prairie">{fmtT(totalDelivered)} t</span>
                        </div>
                        <div className="w-full h-2.5 rounded-full bg-muted overflow-hidden flex">
                          <div
                            className="h-full bg-prairie transition-all duration-500"
                            style={{ width: `${deliveredPct}%` }}
                            title={`Delivered: ${fmtT(totalDelivered)} t`}
                          />
                          {contracted > 0 && (
                            <div
                              className="h-full bg-canola/60 transition-all duration-500"
                              style={{ width: `${contractedPct}%` }}
                              title={`Contracted: ${fmtT(contracted)} t`}
                            />
                          )}
                          <div
                            className="h-full bg-muted-foreground/20 transition-all duration-500"
                            style={{ width: `${uncontractedPct}%` }}
                            title={`Open: ${fmtT(uncontracted)} t`}
                          />
                        </div>
                        <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <span className="inline-block w-2 h-2 rounded-full bg-prairie" />
                            {deliveredPct.toFixed(0)}% delivered
                          </span>
                          {contracted > 0 && (
                            <span className="flex items-center gap-1">
                              <span className="inline-block w-2 h-2 rounded-full bg-canola/60" />
                              {fmtT(contracted)} t contracted
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <span className="inline-block w-2 h-2 rounded-full bg-muted-foreground/20" />
                            {fmtT(uncontracted)} t open
                          </span>
                        </div>
                      </div>

                      {percentiles[plan.grain] !== undefined && (
                        <div className="flex items-center gap-2 pt-1" title="Ranked by % of planned volume delivered, not absolute tonnage">
                          <span className="inline-flex items-center rounded-full bg-prairie/10 px-2.5 py-0.5 text-xs font-medium text-prairie">
                            {Math.round(percentiles[plan.grain])}th percentile
                          </span>
                          <span className="text-xs text-muted-foreground">
                            delivery pace for {plan.grain}
                          </span>
                        </div>
                      )}

                      <div className="pt-3 flex gap-2">
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={() => setDeliveryGrain(plan.grain)}
                        >
                          <Truck className="h-4 w-4 mr-2" />
                          Log Delivery
                        </Button>
                        <Link href={`/grain/${plan.grain.toLowerCase().replace(/ /g, "-")}`} className="flex-1">
                          <Button className="w-full bg-canola/10 text-canola hover:bg-canola hover:text-foreground">
                            Local Intel
                          </Button>
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <Card className="bg-card border-canola/30 shadow-xl shadow-canola/5 sticky top-8">
            <CardHeader>
              <CardTitle className="text-xl font-display text-canola flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Add New Crop
              </CardTitle>
              <CardDescription>
                Unlock local market intelligence for grains you harvest.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action={handleAdd} className="space-y-5">
                {error && <div className="text-error text-sm font-medium">{error}</div>}

                <div className="space-y-2">
                  <Label htmlFor="grain">Commodity</Label>
                  <Select name="grain" required disabled={unusedGrains.length === 0}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select grain to track..." />
                    </SelectTrigger>
                    <SelectContent>
                      {unusedGrains.map(g => (
                        <SelectItem key={g} value={g}>{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="acres">Estimated Acres Seeded</Label>
                  <Input id="acres" name="acres" type="number" placeholder="e.g. 1500" required min="1" step="1"/>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="volume">Remaining Volume to Sell (tonnes)</Label>
                  <Input id="volume" name="volume" type="number" placeholder="e.g. 2500" required min="0" step="1"/>
                  <span className="text-xs text-muted-foreground">Total bins + contracts not yet delivered.</span>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contracted">Of Which Contracted (tonnes)</Label>
                  <Input id="contracted" name="contracted" type="number" placeholder="0" min="0" step="1" defaultValue="0"/>
                  <span className="text-xs text-muted-foreground">
                    Committed to a buyer. Uncontracted is auto-calculated.
                  </span>
                </div>

                <Button type="submit" disabled={loading || unusedGrains.length === 0} className="w-full bg-prairie hover:bg-prairie/90 text-foreground font-semibold">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : "Track Crop"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

      </div>

      {deliveryGrain && (
        <LogDeliveryModal
          grain={deliveryGrain}
          isOpen={true}
          onClose={() => setDeliveryGrain(null)}
        />
      )}
    </div>
  );
}
