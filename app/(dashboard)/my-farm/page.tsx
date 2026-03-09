import { createClient } from "@/lib/supabase/server";
import { getFarmSummary } from "@/lib/queries/intelligence";
import { CURRENT_CROP_YEAR } from "@/lib/utils/crop-year";
import { FarmSummaryCard } from "@/components/dashboard/farm-summary-card";
import { MyFarmClient } from "./client";
import { Wheat } from "lucide-react";

export default async function MyFarmPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: cropPlans }, farmSummary] = await Promise.all([
    supabase
      .from("crop_plans")
      .select("*")
      .eq("user_id", user?.id)
      .eq("crop_year", CURRENT_CROP_YEAR)
      .order("created_at", { ascending: false }),
    user?.id ? getFarmSummary(user.id) : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground flex items-center gap-3">
          <Wheat className="h-8 w-8 text-canola" />
          My Farm
        </h1>
        <p className="text-base text-muted-foreground mt-2 max-w-2xl">
          Track your crop deliveries and compare your pacing against other prairie farmers.
        </p>
      </div>

      <FarmSummaryCard summary={farmSummary} />

      <MyFarmClient currentPlans={cropPlans || []} percentiles={farmSummary?.percentiles ?? {}} />
    </div>
  );
}
