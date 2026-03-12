import { createClient } from "@/lib/supabase/server";
import { getFarmSummary } from "@/lib/queries/intelligence";
import { getDeliveryAnalytics } from "@/lib/queries/delivery-analytics";
import { getSupplyDispositionForGrains } from "@/lib/queries/supply-disposition";
import { getUserRole } from "@/lib/auth/role-guard";
import { CURRENT_CROP_YEAR } from "@/lib/utils/crop-year";
import { grainSlug } from "@/lib/constants/grains";
import { FarmSummaryCard } from "@/components/dashboard/farm-summary-card";
import { DeliveryPaceCard } from "@/components/dashboard/delivery-pace-card";
import { YourImpact } from "@/components/dashboard/your-impact";
import { MyFarmClient } from "./client";
import { Wheat } from "lucide-react";

export default async function MyFarmPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: cropPlans }, farmSummary, analytics, role] = await Promise.all([
    supabase
      .from("crop_plans")
      .select("*")
      .eq("user_id", user?.id)
      .eq("crop_year", CURRENT_CROP_YEAR)
      .order("created_at", { ascending: false }),
    user?.id ? getFarmSummary(user.id) : Promise.resolve(null),
    getDeliveryAnalytics(CURRENT_CROP_YEAR),
    getUserRole(),
  ]);

  const plans = cropPlans || [];
  const percentiles = farmSummary?.percentiles ?? {};
  const hasLoggedDeliveries = plans.some(
    (plan) => (plan.deliveries ?? []).length > 0
  );

  // Fetch AAFC supply data for all grains the farmer tracks
  const grainSlugs = plans.map((p) => grainSlug(p.grain));
  const supplyData = grainSlugs.length > 0
    ? await getSupplyDispositionForGrains(grainSlugs)
    : [];
  const marketSupply: Record<string, { total_supply_kt: number; carry_out_kt: number }> = {};
  for (const sd of supplyData) {
    if (sd.total_supply_kt && sd.carry_out_kt) {
      // Map slug back to grain name for matching with crop plans
      const matchingPlan = plans.find((p) => grainSlug(p.grain) === sd.grain_slug);
      if (matchingPlan) {
        marketSupply[matchingPlan.grain] = {
          total_supply_kt: Number(sd.total_supply_kt),
          carry_out_kt: Number(sd.carry_out_kt),
        };
      }
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground flex items-center gap-3">
          <Wheat className="h-8 w-8 text-canola" />
          My Farm
        </h1>
        <p className="text-base text-muted-foreground mt-2 max-w-2xl">
          Start with one crop, then make Bushel Board smarter with starting grain, what is left to sell, deliveries, and signal feedback.
        </p>
      </div>

      <FarmSummaryCard
        summary={farmSummary}
        hasPlans={plans.length > 0}
        hasLoggedDeliveries={hasLoggedDeliveries}
      />

      {role === "farmer" && plans.length > 0 && (
        <>
          <DeliveryPaceCard plans={plans} percentiles={percentiles} analytics={analytics} />
          <YourImpact variant="farm" />
        </>
      )}

      <MyFarmClient currentPlans={plans} percentiles={percentiles} role={role} marketSupply={marketSupply} />
    </div>
  );
}
