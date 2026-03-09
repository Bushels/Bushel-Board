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

// We can extract a master grain list or just hardcode the common ones
const AVAILABLE_GRAINS = [
  "Wheat", "Canola", "Amber Durum", "Barley", "Peas", "Oats", "Lentils",
  "Soybeans", "Flaxseed", "Mustard Seed", "Corn", "Rye", "Chick Peas",
  "Sunflower Seed", "Canaryseed", "Beans",
];

export function MyFarmClient({ currentPlans, percentiles }: { currentPlans: CropPlan[]; percentiles: Record<string, number> }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deliveryGrain, setDeliveryGrain] = useState<string | null>(null);
  
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
              {currentPlans.map((plan) => (
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
                      <span className="font-semibold">{((plan.volume_left_to_sell_kt ?? 0) * 1000).toLocaleString("en-CA", { maximumFractionDigits: 0 })} t</span>
                    </div>

                    {(() => {
                      const totalDelivered = (plan.deliveries || []).reduce((sum, d) => sum + d.amount_kt, 0);
                      const totalVolume = plan.volume_left_to_sell_kt ?? 0;
                      const remaining = Math.max(0, totalVolume - totalDelivered);
                      const pct = totalVolume > 0 ? Math.min(100, (totalDelivered / totalVolume) * 100) : 0;
                      return (
                        <div className="space-y-2 pt-1">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Delivered</span>
                            <span className="font-semibold text-prairie">{(totalDelivered * 1000).toLocaleString("en-CA", { maximumFractionDigits: 0 })} t</span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full bg-prairie transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{pct.toFixed(0)}% delivered</span>
                            <span>{(remaining * 1000).toLocaleString("en-CA", { maximumFractionDigits: 0 })} t remaining</span>
                          </div>
                        </div>
                      );
                    })()}

                    {percentiles[plan.grain] !== undefined && (
                      <div className="flex items-center gap-2 pt-1">
                        <span className="inline-flex items-center rounded-full bg-prairie/10 px-2.5 py-0.5 text-xs font-medium text-prairie">
                          Top {100 - percentiles[plan.grain]}%
                        </span>
                        <span className="text-xs text-muted-foreground">
                          of farmers tracking {plan.grain}
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
              ))}
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
