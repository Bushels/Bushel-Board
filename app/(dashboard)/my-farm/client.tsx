"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { addCropPlan, removeCropPlan } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowRight,
  BarChart3,
  type LucideIcon,
  Loader2,
  Plus,
  Radio,
  Sparkles,
  Trash2,
  Truck,
} from "lucide-react";
import { CURRENT_CROP_YEAR, cropYearLabel } from "@/lib/utils/crop-year";
import { LogDeliveryModal } from "@/components/dashboard/log-delivery-modal";
import type { CropPlan } from "@/lib/queries/crop-plans";
import type { UserRole } from "@/lib/auth/role-guard";
import { getCropPlanPaceBreakdown } from "@/lib/utils/crop-plan";

const AVAILABLE_GRAINS = [
  "Wheat", "Canola", "Amber Durum", "Barley", "Peas", "Oats", "Lentils",
  "Soybeans", "Flaxseed", "Mustard Seed", "Corn", "Rye", "Chick Peas",
  "Sunflower", "Canaryseed", "Beans",
];

const fmtT = (kt: number) =>
  (kt * 1000).toLocaleString("en-CA", { maximumFractionDigits: 0 });

const FIRST_RUN_BENEFITS = [
  {
    title: "Unlock grain pages",
    description: "Add one crop and acres to open that grain's AI detail page right away.",
    icon: Sparkles,
  },
  {
    title: "Train the AI with your farm",
    description: "Remaining tonnes and deliveries make the thesis more specific to your marketing reality.",
    icon: BarChart3,
  },
  {
    title: "Improve the X feed",
    description: "Your signal feedback helps Bushel Board rank the posts farmers actually care about.",
    icon: Radio,
  },
];

interface MyFarmClientProps {
  currentPlans: CropPlan[];
  percentiles: Record<string, number>;
  role?: UserRole;
}

export function MyFarmClient({
  currentPlans,
  percentiles,
  role = "farmer",
}: MyFarmClientProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deliveryGrain, setDeliveryGrain] = useState<string | null>(null);
  const setupCardRef = useRef<HTMLDivElement>(null);

  const isObserver = role === "observer";
  const isFirstRun = currentPlans.length === 0;
  const hasAnyDeliveries = currentPlans.some(
    (plan) => (plan.deliveries ?? []).length > 0
  );
  const unusedGrains = AVAILABLE_GRAINS.filter(
    (grain) => !currentPlans.some((cropPlan) => cropPlan.grain === grain)
  );

  async function handleAdd(formData: FormData) {
    setLoading(true);
    setError(null);
    const result = await addCropPlan(formData);
    if (result?.error) {
      setError(result.error);
    }
    setLoading(false);
  }

  async function handleRemove(grain: string) {
    setLoading(true);
    await removeCropPlan(grain);
    setLoading(false);
  }

  function scrollToSetup() {
    setupCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (isObserver) {
    return (
      <div className="py-16 text-center space-y-4">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-canola/10">
          <Truck className="h-8 w-8 text-canola" />
        </div>
        <h3 className="text-xl font-display font-semibold">Observer Account</h3>
        <p className="mx-auto max-w-md text-muted-foreground">
          You&apos;re browsing as an observer. Switch to a farmer account to track crops,
          log deliveries, and unlock personalized intelligence.
        </p>
        <p className="text-xs text-muted-foreground">
          Contact support or re-register as a farmer to access these features.
        </p>
      </div>
    );
  }

  const setupCard = (
    <div ref={setupCardRef} id="crop-setup">
      <Card
        className={
          isFirstRun
            ? "border-canola/30 bg-background/88 shadow-[0_24px_50px_-30px_rgba(42,38,30,0.55)] backdrop-blur-xl"
            : "border-canola/30 bg-background/88 shadow-[0_24px_50px_-30px_rgba(42,38,30,0.55)] backdrop-blur-xl lg:sticky lg:top-6"
        }
      >
        <CardHeader>
          <CardTitle className="text-xl font-display text-canola flex items-center gap-2">
            <Plus className="h-5 w-5" />
            {isFirstRun ? "Unlock My Farm" : "Add New Crop"}
          </CardTitle>
          <CardDescription>
            {isFirstRun
              ? "Start with one crop. You can add the rest once the dashboard starts paying you back."
              : "Unlock local market intelligence for another grain you harvest."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={handleAdd} className="space-y-5">
            {error && <div className="text-sm font-medium text-error">{error}</div>}

            <div className="space-y-2">
              <Label htmlFor="grain">Commodity</Label>
              <Select name="grain" required disabled={unusedGrains.length === 0}>
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={isFirstRun ? "Pick your first crop" : "Select grain to track..."}
                  />
                </SelectTrigger>
                <SelectContent>
                  {unusedGrains.map((grain) => (
                    <SelectItem key={grain} value={grain}>
                      {grain}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="acres">Estimated Acres Seeded</Label>
              <Input
                id="acres"
                name="acres"
                type="number"
                placeholder="e.g. 1500"
                required
                min="1"
                step="1"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="volume">Remaining Volume to Sell (tonnes)</Label>
              <Input
                id="volume"
                name="volume"
                type="number"
                placeholder="e.g. 2500"
                required
                min="0"
                step="1"
              />
              <span className="text-xs text-muted-foreground">
                Total bins + contracts not yet delivered. This makes the AI and pace cards more specific.
              </span>
            </div>

            <div className="space-y-2">
              <Label htmlFor="contracted">Of Which Contracted (tonnes)</Label>
              <Input
                id="contracted"
                name="contracted"
                type="number"
                placeholder="0"
                min="0"
                step="1"
                defaultValue="0"
              />
              <span className="text-xs text-muted-foreground">
                Committed to a buyer. Uncontracted is auto-calculated.
              </span>
            </div>

            <Button
              type="submit"
              disabled={loading || unusedGrains.length === 0}
              className="w-full bg-prairie font-semibold text-foreground hover:bg-prairie/90"
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : isFirstRun ? (
                "Unlock My Farm"
              ) : (
                "Track Crop"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="space-y-8 text-foreground">
      {isFirstRun ? (
        <>
          <section className="relative overflow-hidden rounded-[2rem] border border-canola/20 bg-gradient-to-br from-canola/10 via-background to-background p-6 sm:p-8">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(193,127,36,0.18),transparent_40%)]" />
            <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
              <div className="max-w-2xl space-y-4">
                <span className="inline-flex items-center gap-2 rounded-full border border-canola/20 bg-canola/8 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-canola">
                  <Sparkles className="h-3.5 w-3.5" />
                  Unlock farm-specific intelligence
                </span>
                <h2 className="text-3xl font-display font-semibold leading-tight text-foreground sm:text-4xl">
                  Start with one crop. Bushel Board gets sharper as you add real farm data.
                </h2>
                <p className="max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                  Add a crop plan to unlock its grain page, then make the AI more specific with
                  remaining tonnes, deliveries, and signal feedback. The more grounded your farm
                  data is, the less generic the product feels.
                </p>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Button
                    type="button"
                    onClick={scrollToSetup}
                    className="bg-canola text-white hover:bg-canola-dark"
                  >
                    Unlock My Farm
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                  <p className="text-xs text-muted-foreground sm:max-w-xs">
                    Acres unlock the dashboard now. Deliveries and X ratings improve it over time.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3 xl:max-w-[36rem]">
                {FIRST_RUN_BENEFITS.map((benefit) => (
                  <BenefitCard
                    key={benefit.title}
                    title={benefit.title}
                    description={benefit.description}
                    icon={benefit.icon}
                  />
                ))}
              </div>
            </div>
          </section>

          <div className="mx-auto max-w-xl">
            {setupCard}
          </div>
        </>
      ) : (
        <>
          {!hasAnyDeliveries && (
            <div className="rounded-2xl border border-canola/20 bg-canola/6 px-4 py-3 text-sm shadow-[0_18px_40px_-30px_rgba(42,38,30,0.45)]">
              <div className="font-medium text-foreground">
                Next unlock: log your first delivery.
              </div>
              <p className="mt-1 text-muted-foreground">
                Your crop plan is live. Add one delivery on any crop card to sharpen pace tracking and your weekly AI brief.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <div className="space-y-6">
              <div className="flex flex-col gap-1">
                <h2 className="text-2xl font-display font-semibold">Active Crops</h2>
                <p className="text-sm text-muted-foreground">
                  These are the grains currently teaching Bushel Board what matters to your farm.
                </p>
              </div>

              <div className="grid gap-4">
                {currentPlans.map((plan) => {
                  const totalDelivered = (plan.deliveries || []).reduce(
                    (sum, delivery) => sum + delivery.amount_kt,
                    0
                  );
                  const remainingToSell = Number(plan.volume_left_to_sell_kt ?? 0);
                  const contracted = Number(plan.contracted_kt ?? 0);
                  const uncontracted = Number(plan.uncontracted_kt ?? 0);
                  const pace = getCropPlanPaceBreakdown({
                    deliveredKt: totalDelivered,
                    remainingToSellKt: remainingToSell,
                    contractedKt: contracted,
                    uncontractedKt: uncontracted,
                  });

                  return (
                    <Card
                      key={plan.grain}
                      className="border-border/40 bg-card/55 backdrop-blur-sm transition-all hover:border-canola/25 hover:bg-card hover:shadow-lg"
                    >
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-border/20 pb-3">
                        <div>
                          <CardTitle className="text-lg font-display">{plan.grain}</CardTitle>
                          <CardDescription>
                            {cropYearLabel(CURRENT_CROP_YEAR, "Season")}
                          </CardDescription>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemove(plan.grain)}
                          disabled={loading}
                          className="text-muted-foreground hover:text-error"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </CardHeader>
                      <CardContent className="space-y-3 pt-4">
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Area Seeded</span>
                          <span className="font-semibold">{plan.acres_seeded.toLocaleString()} ac</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Remaining to Sell</span>
                          <span className="font-semibold">{fmtT(remainingToSell)} t</span>
                        </div>

                        <div className="space-y-2 pt-1">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Delivered</span>
                            <span className="font-semibold text-prairie">
                              {fmtT(totalDelivered)} t
                            </span>
                          </div>
                          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full bg-prairie transition-all duration-500"
                              style={{ width: `${pace.deliveredPct}%` }}
                              title={`Delivered: ${fmtT(totalDelivered)} t`}
                            />
                            {contracted > 0 && (
                              <div
                                className="h-full bg-canola/60 transition-all duration-500"
                                style={{ width: `${pace.contractedPct}%` }}
                                title={`Contracted: ${fmtT(contracted)} t`}
                              />
                            )}
                            <div
                              className="h-full bg-muted-foreground/20 transition-all duration-500"
                              style={{ width: `${pace.uncontractedPct}%` }}
                              title={`Open: ${fmtT(uncontracted)} t`}
                            />
                          </div>
                          <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <span className="inline-block h-2 w-2 rounded-full bg-prairie" />
                              {pace.deliveredPct.toFixed(0)}% delivered
                            </span>
                            {contracted > 0 && (
                              <span className="flex items-center gap-1">
                                <span className="inline-block h-2 w-2 rounded-full bg-canola/60" />
                                {fmtT(contracted)} t contracted
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/20" />
                              {fmtT(uncontracted)} t open
                            </span>
                          </div>
                        </div>

                        {percentiles[plan.grain] !== undefined && (
                          <div
                            className="flex items-center gap-2 pt-1"
                            title="Ranked by the share of tracked crop-plan volume already delivered, not by absolute tonnage"
                          >
                            <span className="inline-flex items-center rounded-full bg-prairie/10 px-2.5 py-0.5 text-xs font-medium text-prairie">
                              {Math.round(percentiles[plan.grain])}th percentile
                            </span>
                            <span className="text-xs text-muted-foreground">
                              delivery pace for {plan.grain}
                            </span>
                          </div>
                        )}

                        <div className="flex gap-2 pt-3">
                          <Button
                            variant="outline"
                            className="flex-1"
                            onClick={() => setDeliveryGrain(plan.grain)}
                          >
                            <Truck className="mr-2 h-4 w-4" />
                            Log Delivery
                          </Button>
                          <Link
                            href={`/grain/${plan.grain.toLowerCase().replace(/ /g, "-")}`}
                            className="flex-1"
                          >
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
            </div>

            <div>{setupCard}</div>
          </div>
        </>
      )}

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

function BenefitCard({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <div className="rounded-3xl border border-white/45 bg-white/65 p-4 shadow-[0_18px_38px_-28px_rgba(42,38,30,0.45)] backdrop-blur-xl dark:border-white/10 dark:bg-white/6">
      <Icon className="h-5 w-5 text-canola" />
      <p className="mt-3 font-display text-base font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
