"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
  PencilLine,
  Plus,
  Radio,
  Sparkles,
  Trash2,
  Truck,
} from "lucide-react";
import { ALL_GRAINS } from "@/lib/constants/grains";
import { CURRENT_CROP_YEAR, cropYearLabel } from "@/lib/utils/crop-year";
import { LogDeliveryModal } from "@/components/dashboard/log-delivery-modal";
import type { CropPlan } from "@/lib/queries/crop-plans";
import type { UserRole } from "@/lib/auth/role-guard";
import { getCropPlanMarketingBreakdown } from "@/lib/utils/crop-plan";
import {
  convertKtToTonnes,
  convertMetricTonnesToUnit,
  formatGrainUnitLabel,
  getDefaultBushelWeightLbs,
  getYieldMetrics,
  type GrainAmountUnit,
} from "@/lib/utils/grain-units";

const AVAILABLE_GRAINS = ALL_GRAINS.map((grain) => grain.name);

const fmtT = (kt: number) =>
  (kt * 1000).toLocaleString("en-CA", { maximumFractionDigits: 0 });
const roundForInput = (value: number) => Number(value.toFixed(2));

const FIRST_RUN_BENEFITS = [
  {
    title: "Unlock grain pages",
    description: "Add one crop and acres to open that grain's AI detail page right away.",
    icon: Sparkles,
  },
  {
    title: "Train the AI with your farm",
    description: "Starting grain, grain left to sell, and deliveries make the thesis more specific to your marketing reality.",
    icon: BarChart3,
  },
  {
    title: "Improve the X feed",
    description: "Your signal feedback helps Bushel Board rank the posts farmers actually care about.",
    icon: Radio,
  },
];

export interface MarketSupplyData {
  total_opening_supply_kt: number;
  cytd_producer_deliveries_kt: number;
  is_approximate?: boolean;
}

interface MyFarmClientProps {
  currentPlans: CropPlan[];
  percentiles: Record<string, number>;
  role?: UserRole;
  marketSupply?: Record<string, MarketSupplyData>;
}

interface CropPlanSetupPrefill {
  grain?: string;
  acres?: string;
}

export function MyFarmClient({
  currentPlans,
  percentiles,
  role = "farmer",
  marketSupply = {},
}: MyFarmClientProps) {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deliveryGrain, setDeliveryGrain] = useState<CropPlan | null>(null);
  const [editingPlan, setEditingPlan] = useState<CropPlan | null>(null);
  const setupCardRef = useRef<HTMLDivElement>(null);

  const isObserver = role === "observer";
  const isFirstRun = currentPlans.length === 0;
  const hasAnyDeliveries = currentPlans.some(
    (plan) => (plan.deliveries ?? []).length > 0
  );
  const unusedGrains = AVAILABLE_GRAINS.filter(
    (grain) => !currentPlans.some((cropPlan) => cropPlan.grain === grain)
  );
  const requestedGrain = searchParams.get("grain");
  const requestedAcres = searchParams.get("acres")?.trim();
  const setupPrefill: CropPlanSetupPrefill | undefined =
    requestedGrain && unusedGrains.includes(requestedGrain)
      ? {
          grain: requestedGrain,
          acres: requestedAcres || undefined,
        }
      : undefined;

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

  async function handleEdit(formData: FormData) {
    setLoading(true);
    setError(null);
    const result = await addCropPlan(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    setEditingPlan(null);
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
            {setupPrefill?.grain
              ? `Finish ${setupPrefill.grain} in My Farm. Add inventory once, then Bushel Board can keep the grain-left and priced math correct.`
              : isFirstRun
              ? "Start with one crop. You can add the rest once the dashboard starts paying you back."
              : "Unlock local market intelligence for another grain you harvest."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={handleAdd} className="space-y-5">
            {error && <div className="text-sm font-medium text-error">{error}</div>}

            <CropPlanFields
              key={`add-${setupPrefill?.grain ?? "none"}-${setupPrefill?.acres ?? "none"}-${unusedGrains.join("|") || "none"}`}
              idPrefix="add"
              grainOptions={setupPrefill?.grain ? [setupPrefill.grain] : unusedGrains}
              grainPlaceholder={isFirstRun ? "Pick your first crop" : "Select grain to track..."}
              grainLocked={Boolean(setupPrefill?.grain)}
              prefill={setupPrefill}
            />

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
                  starting grain, what is left to sell, deliveries, and signal feedback. The more
                  grounded your farm data is, the less generic the product feels.
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
                    Acres unlock the dashboard now. Grain inventory, deliveries, and X ratings improve it over time.
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
                Your crop plan is live. Add one delivery on any crop card to keep grain-left and contract percentages current for your weekly AI brief.
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
                  const startingGrain = Number(plan.starting_grain_kt ?? 0);
                  const bushelWeightLbs = Number(
                    plan.bushel_weight_lbs ?? getDefaultBushelWeightLbs(plan.grain)
                  );
                  const inventoryUnit = plan.inventory_unit_preference ?? "metric_tonnes";
                  const remainingToSell = Number(plan.volume_left_to_sell_kt ?? 0);
                  const contracted = Number(plan.contracted_kt ?? 0);
                  const uncontracted = Number(plan.uncontracted_kt ?? 0);
                  const marketing = getCropPlanMarketingBreakdown({
                    startingGrainKt: startingGrain,
                    remainingToSellKt: remainingToSell,
                    contractedKt: contracted,
                    uncontractedKt: uncontracted,
                  });
                  const yieldMetrics = getYieldMetrics({
                    acres: plan.acres_seeded,
                    startingGrainKt: marketing.startingGrainKt,
                    bushelWeightLbs,
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
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setError(null);
                              setEditingPlan(plan);
                            }}
                            disabled={loading}
                            className="text-muted-foreground hover:text-canola"
                          >
                            <PencilLine className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemove(plan.grain)}
                            disabled={loading}
                            className="text-muted-foreground hover:text-error"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3 pt-4">
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Area Seeded</span>
                          <span className="font-semibold">{plan.acres_seeded.toLocaleString()} ac</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-sm text-muted-foreground">Estimated Yield</span>
                          <span className="text-right">
                            <span className="font-semibold">{yieldMetrics.bushelsPerAcre.toFixed(1)} bu/ac</span>
                            <br />
                            <span className="text-xs text-muted-foreground">
                              {yieldMetrics.tonnesPerAcre.toFixed(2)} t/ac
                            </span>
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Starting Grain</span>
                          <span className="font-semibold">{fmtT(marketing.startingGrainKt)} t</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Est. Left to Sell</span>
                          <span className="font-semibold">{fmtT(remainingToSell)} t</span>
                        </div>

                        <div className="grid gap-3 rounded-2xl border border-border/30 bg-muted/20 p-3 sm:grid-cols-2">
                          <div>
                            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                              In Bin
                            </p>
                            <p className="mt-1 font-display text-lg font-semibold text-foreground">
                              {marketing.grainLeftPct.toFixed(0)}%
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {fmtT(remainingToSell)} t still left to sell
                            </p>
                          </div>
                          <div>
                            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                              Priced
                            </p>
                            <p className="mt-1 font-display text-lg font-semibold text-prairie">
                              {marketing.pricedPct.toFixed(0)}%
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {fmtT(marketing.pricedKt)} t sold or already contracted
                            </p>
                          </div>
                          <div>
                            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                              Contracted
                            </p>
                            <p className="mt-1 font-display text-lg font-semibold text-canola">
                              {marketing.contractedPct.toFixed(0)}%
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {fmtT(contracted)} t outstanding
                            </p>
                          </div>
                          <div>
                            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                              Open Market
                            </p>
                            <p className="mt-1 font-display text-lg font-semibold text-foreground">
                              {marketing.uncontractedPct.toFixed(0)}%
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {fmtT(uncontracted)} t still open
                            </p>
                          </div>
                        </div>

                        {(() => {
                          const ms = marketSupply[plan.grain];
                          if (!ms || marketing.startingGrainKt <= 0) return null;
                          const farmerPctLeft = marketing.grainLeftPct;
                          const marketBinStock = ms.total_opening_supply_kt - ms.cytd_producer_deliveries_kt;
                          const marketPctLeft = Math.max(0, Math.min(100, (marketBinStock / ms.total_opening_supply_kt) * 100));
                          const diff = farmerPctLeft - marketPctLeft;
                          const diffLabel = diff > 1
                            ? `${Math.abs(diff).toFixed(0)}% more grain remaining than the market average`
                            : diff < -1
                              ? `${Math.abs(diff).toFixed(0)}% less grain remaining than the market average`
                              : "on par with the market average";
                          return (
                            <div className="rounded-2xl border border-canola/20 bg-canola/5 p-3 space-y-2">
                              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                                % Left in Bin vs Market
                              </p>
                              <div className="flex items-end gap-4">
                                <div className="flex-1">
                                  <div className="flex items-baseline justify-between">
                                    <span className="text-xs font-medium text-canola">You</span>
                                    <span className="font-display text-lg font-semibold text-canola">{farmerPctLeft.toFixed(0)}%</span>
                                  </div>
                                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                                    <div
                                      className="h-full rounded-full bg-canola transition-all duration-500"
                                      style={{ width: `${farmerPctLeft}%` }}
                                    />
                                  </div>
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-baseline justify-between">
                                    <span className="text-xs font-medium text-muted-foreground">Market</span>
                                    <span className="font-display text-lg font-semibold text-muted-foreground">{ms.is_approximate ? '~' : ''}{marketPctLeft.toFixed(0)}%</span>
                                  </div>
                                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                                    <div
                                      className="h-full rounded-full bg-muted-foreground/40 transition-all duration-500"
                                      style={{ width: `${marketPctLeft}%` }}
                                    />
                                  </div>
                                </div>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                You have <span className="font-semibold text-foreground">{diffLabel}</span> remaining.
                                Market figure is total opening supply minus cumulative producer deliveries to date.{ms.is_approximate ? ' Supply estimate is approximate (~).' : ''}
                              </p>
                            </div>
                          );
                        })()}

                        <div className="space-y-2 pt-1">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Market Position</span>
                            <span className="font-semibold text-prairie">
                              {fmtT(marketing.pricedKt)} t priced
                            </span>
                          </div>
                          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
                            {marketing.marketedPct > 0 && (
                              <div
                                className="h-full bg-prairie transition-all duration-500"
                                style={{ width: `${marketing.marketedPct}%` }}
                                title={`Already moved or sold: ${fmtT(marketing.marketedKt)} t`}
                              />
                            )}
                            {contracted > 0 && (
                              <div
                                className="h-full bg-canola/65 transition-all duration-500"
                                style={{ width: `${marketing.contractedPct}%` }}
                                title={`Contracted and undelivered: ${fmtT(contracted)} t`}
                              />
                            )}
                            {uncontracted > 0 && (
                              <div
                                className="h-full bg-muted-foreground/25 transition-all duration-500"
                                style={{ width: `${marketing.uncontractedPct}%` }}
                                title={`Open market: ${fmtT(uncontracted)} t`}
                              />
                            )}
                          </div>
                          <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                            {marketing.marketedKt > 0 && (
                              <span className="flex items-center gap-1">
                                <span className="inline-block h-2 w-2 rounded-full bg-prairie" />
                                {fmtT(marketing.marketedKt)} t already moved
                              </span>
                            )}
                            {contracted > 0 && (
                              <span className="flex items-center gap-1">
                                <span className="inline-block h-2 w-2 rounded-full bg-canola/65" />
                                {fmtT(contracted)} t contracted
                              </span>
                            )}
                            {uncontracted > 0 && (
                              <span className="flex items-center gap-1">
                                <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/25" />
                                {fmtT(uncontracted)} t open
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Logged deliveries: {fmtT(totalDelivered)} t. Contracted share of remaining:{" "}
                            {marketing.contractedShareOfRemainingPct.toFixed(0)}%.
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Input preference: {formatGrainUnitLabel(inventoryUnit)}
                            {inventoryUnit === "bushels" ? ` at ${bushelWeightLbs.toFixed(1)} lb/bu` : ""}
                            .
                          </p>
                        </div>

                        {percentiles[plan.grain] !== undefined && (
                          <div
                            className="flex items-center gap-2 pt-1"
                            title="Ranked by the share of estimated starting grain already priced or moved, not by absolute tonnage"
                          >
                            <span className="inline-flex items-center rounded-full bg-prairie/10 px-2.5 py-0.5 text-xs font-medium text-prairie">
                              {Math.round(percentiles[plan.grain])}th percentile
                            </span>
                            <span className="text-xs text-muted-foreground">
                              marketing pace for {plan.grain}
                            </span>
                          </div>
                        )}

                        <div className="flex gap-2 pt-3">
                          <Button
                            variant="outline"
                            className="flex-1"
                            disabled={remainingToSell <= 0}
                            onClick={() => setDeliveryGrain(plan)}
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
          grain={deliveryGrain.grain}
          bushelWeightLbs={Number(
            deliveryGrain.bushel_weight_lbs ?? getDefaultBushelWeightLbs(deliveryGrain.grain)
          )}
          contractedKt={Number(deliveryGrain.contracted_kt ?? 0)}
          openKt={Math.max(
            Number(
              deliveryGrain.uncontracted_kt
                ?? (
                  Number(deliveryGrain.volume_left_to_sell_kt ?? 0)
                  - Number(deliveryGrain.contracted_kt ?? 0)
                )
            ),
            0
          )}
          remainingKt={Number(deliveryGrain.volume_left_to_sell_kt ?? 0)}
          isOpen={true}
          onClose={() => setDeliveryGrain(null)}
        />
      )}

      {editingPlan && (
        <CropPlanEditModal
          key={editingPlan.grain}
          plan={editingPlan}
          pending={loading}
          error={error}
          onClose={() => {
            setError(null);
            setEditingPlan(null);
          }}
          onSubmit={handleEdit}
        />
      )}
    </div>
  );
}

function CropPlanFields({
  idPrefix,
  plan,
  grainOptions = AVAILABLE_GRAINS,
  grainPlaceholder = "Select grain",
  grainLocked = false,
  prefill,
}: {
  idPrefix: string;
  plan?: CropPlan;
  grainOptions?: string[];
  grainPlaceholder?: string;
  grainLocked?: boolean;
  prefill?: CropPlanSetupPrefill;
}) {
  const initialGrain =
    plan?.grain
    ?? (prefill?.grain && grainOptions.includes(prefill.grain) ? prefill.grain : grainOptions[0] ?? "");
  const initialUnit = plan?.inventory_unit_preference ?? "metric_tonnes";
  const initialBushelWeight = Number(
    plan?.bushel_weight_lbs ?? getDefaultBushelWeightLbs(initialGrain)
  );

  const [selectedGrain, setSelectedGrain] = useState(initialGrain);
  const [inventoryUnit, setInventoryUnit] = useState<GrainAmountUnit>(initialUnit);
  const [bushelWeightLbs, setBushelWeightLbs] = useState(initialBushelWeight);
  const preferredBushelWeight =
    bushelWeightLbs > 0
      ? bushelWeightLbs
      : Number(plan?.bushel_weight_lbs ?? getDefaultBushelWeightLbs(selectedGrain));
  const displayStarting = plan
    ? convertMetricTonnesToUnit(
      convertKtToTonnes(
        Number(plan.starting_grain_kt ?? plan.volume_left_to_sell_kt ?? 0)
      ),
      inventoryUnit,
      preferredBushelWeight
    )
    : undefined;
  const displayRemaining = plan
    ? convertMetricTonnesToUnit(
      convertKtToTonnes(Number(plan.volume_left_to_sell_kt ?? 0)),
      inventoryUnit,
      preferredBushelWeight
    )
    : undefined;
  const displayContracted = plan
    ? convertMetricTonnesToUnit(
      convertKtToTonnes(Number(plan.contracted_kt ?? 0)),
      inventoryUnit,
      preferredBushelWeight
    )
    : undefined;

  const unitLabel = formatGrainUnitLabel(inventoryUnit).toLowerCase();
  const startingPlaceholder =
    inventoryUnit === "metric_tonnes"
      ? "e.g. 3200"
      : inventoryUnit === "bushels"
        ? "e.g. 64000"
        : "e.g. 7050000";
  const remainingPlaceholder =
    inventoryUnit === "metric_tonnes"
      ? "e.g. 2500"
      : inventoryUnit === "bushels"
        ? "e.g. 50000"
        : "e.g. 5510000";

  return (
    <>
      {grainLocked ? (
        <>
          <input type="hidden" name="grain" value={selectedGrain} />
          <div className="space-y-2">
            <Label>Commodity</Label>
            <div className="rounded-md border border-border/40 bg-muted/20 px-3 py-2 text-sm font-medium">
              {selectedGrain}
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-grain`}>Commodity</Label>
          <Select
            name="grain"
            required
            value={selectedGrain}
            onValueChange={(grain) => {
              setSelectedGrain(grain);
              if (!plan?.bushel_weight_lbs) {
                setBushelWeightLbs(getDefaultBushelWeightLbs(grain));
              }
            }}
            disabled={grainOptions.length === 0}
          >
            <SelectTrigger id={`${idPrefix}-grain`} className="w-full">
              <SelectValue placeholder={grainPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {grainOptions.map((grain) => (
                <SelectItem key={grain} value={grain}>
                  {grain}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-acres`}>Estimated Acres Seeded</Label>
        <Input
          id={`${idPrefix}-acres`}
          name="acres"
          type="number"
          placeholder="e.g. 1500"
          required
          min="1"
          step="1"
          defaultValue={plan?.acres_seeded ?? prefill?.acres}
        />
      </div>

      <div className="grid gap-4 rounded-2xl border border-canola/15 bg-canola/5 p-4">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-inventory-unit`}>Crop Amount Unit</Label>
          <select
            id={`${idPrefix}-inventory-unit`}
            name="inventory_unit"
            value={inventoryUnit}
            onChange={(event) => setInventoryUnit(event.target.value as GrainAmountUnit)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="metric_tonnes">Metric tonnes</option>
            <option value="bushels">Bushels</option>
            <option value="pounds">Pounds</option>
          </select>
          <p className="text-xs text-muted-foreground">
            Bushel Board converts this to metric tonnes before saving so it lines up with CGC data.
          </p>
        </div>

        {inventoryUnit === "bushels" ? (
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-bushel-weight`}>Bushel Weight (lb/bu)</Label>
            <Input
              id={`${idPrefix}-bushel-weight`}
              name="bushel_weight_lbs"
              type="number"
              min="0.1"
              step="0.1"
              required
              value={bushelWeightLbs}
              onChange={(event) => setBushelWeightLbs(Number(event.target.value || 0))}
            />
            <p className="text-xs text-muted-foreground">
              Default for {selectedGrain}: {getDefaultBushelWeightLbs(selectedGrain).toFixed(1)} lb/bu.
            </p>
          </div>
        ) : (
          <input type="hidden" name="bushel_weight_lbs" value={bushelWeightLbs} />
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-starting`}>
          Estimated Starting Grain Amount ({unitLabel})
        </Label>
        <Input
          key={`${idPrefix}-starting-${inventoryUnit}-${selectedGrain}-${preferredBushelWeight}`}
          id={`${idPrefix}-starting`}
          name="starting"
          type="number"
          placeholder={startingPlaceholder}
          required
          min="0.01"
          step="any"
          defaultValue={
            displayStarting !== undefined ? roundForInput(displayStarting) : undefined
          }
        />
        <span className="text-xs text-muted-foreground">
          With acres, this lets Bushel Board show estimated yield in both bu/ac and t/ac.
        </span>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-volume`}>
          Est. Grain Left to Sell ({unitLabel})
        </Label>
        <Input
          key={`${idPrefix}-volume-${inventoryUnit}-${selectedGrain}-${preferredBushelWeight}`}
          id={`${idPrefix}-volume`}
          name="volume"
          type="number"
          placeholder={remainingPlaceholder}
          required
          min="0"
          step="any"
          defaultValue={displayRemaining !== undefined ? roundForInput(displayRemaining) : undefined}
        />
        <span className="text-xs text-muted-foreground">
          Current bins plus undelivered contracts. Deliveries will reduce this automatically.
        </span>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-contracted`}>
          Of Which Contracted ({unitLabel})
        </Label>
        <Input
          key={`${idPrefix}-contracted-${inventoryUnit}-${selectedGrain}-${preferredBushelWeight}`}
          id={`${idPrefix}-contracted`}
          name="contracted"
          type="number"
          placeholder="0"
          min="0"
          step="any"
          defaultValue={
            displayContracted !== undefined ? roundForInput(displayContracted) : "0"
          }
        />
        <span className="text-xs text-muted-foreground">
          The committed part of what is still left to sell. Open tonnes are auto-calculated.
        </span>
      </div>
    </>
  );
}

function CropPlanEditModal({
  plan,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  plan: CropPlan;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (formData: FormData) => Promise<void>;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
      <Card className="w-full max-w-lg border-canola/20 bg-background/95 shadow-2xl">
        <CardHeader>
          <CardTitle className="text-xl font-display text-canola">
            Edit {plan.grain}
          </CardTitle>
          <CardDescription>
            Update acres, starting grain, grain left to sell, and contracted tonnes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={onSubmit} className="space-y-5">
            <CropPlanFields
              key={`edit-${plan.grain}-${plan.inventory_unit_preference ?? "metric_tonnes"}-${plan.bushel_weight_lbs ?? "default"}`}
              idPrefix="edit"
              plan={plan}
              grainLocked
            />

            {error && <div className="text-sm font-medium text-error">{error}</div>}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={pending}
                className="bg-prairie font-semibold text-foreground hover:bg-prairie/90"
              >
                {pending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
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
