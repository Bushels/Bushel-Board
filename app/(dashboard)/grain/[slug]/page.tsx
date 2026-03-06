import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Lock, Wheat } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getGrainBySlug } from "@/lib/queries/grains";
import {
  getDeliveryTimeSeries,
  getProvincialDeliveries,
  getShipmentDistribution,
  getCumulativeTimeSeries,
  getStorageBreakdown,
} from "@/lib/queries/observations";
import { getGrainIntelligence, getSupplyPipeline } from "@/lib/queries/intelligence";
import { ThesisBanner } from "@/components/dashboard/thesis-banner";
import { IntelligenceKpis } from "@/components/dashboard/intelligence-kpis";
import { SupplyPipeline } from "@/components/dashboard/supply-pipeline";
import { InsightCards } from "@/components/dashboard/insight-cards";
import { ProvincialCards } from "@/components/dashboard/provincial-cards";
import { DispositionBar } from "@/components/dashboard/disposition-bar";
import { Button } from "@/components/ui/button";

import { SupplyWidget } from "@/components/dashboard/supply-widget";
import { FlowBreakdownWidget } from "@/components/dashboard/flow-breakdown-widget";
import { StockMapWidget } from "@/components/dashboard/stock-map-widget";
import { GamifiedGrainChart } from "@/components/dashboard/gamified-grain-chart";
import type { DeliveryEntry } from "@/lib/queries/crop-plans";
import { CURRENT_CROP_YEAR, cropYearLabel } from "@/lib/utils/crop-year";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function GrainDetailPage({ params }: Props) {
  const { slug } = await params;

  const grain = await getGrainBySlug(slug);
  if (!grain) notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Get macro estimates for the grain
  const { data: macro } = await supabase
    .from("macro_estimates")
    .select("*")
    .eq("crop_year", CURRENT_CROP_YEAR)
    .ilike("grain", grain.name)
    .single();

  // Check if user has unlocked this grain via my-farm
  let userPlan = null;
  if (user) {
    const { data: plan } = await supabase
      .from("crop_plans")
      .select("*")
      .eq("user_id", user.id)
      .eq("crop_year", CURRENT_CROP_YEAR)
      .ilike("grain", grain.name)
      .single();
    userPlan = plan;
  }

  const isUnlocked = !!userPlan;

  if (!isUnlocked) {
    return <GrainLockedView grain={grain.name} slug={slug} />;
  }

  const [deliveries, provincial, distribution, weeklyData, storageData, intelligence, supplyPipeline] = await Promise.all([
    getDeliveryTimeSeries(grain.name),
    getProvincialDeliveries(grain.name),
    getShipmentDistribution(grain.name),
    getCumulativeTimeSeries(grain.name),
    getStorageBreakdown(grain.name),
    getGrainIntelligence(grain.name),
    getSupplyPipeline(grain.slug),
  ]);

  // Aggregate total deliveries
  const totalDeliveries = deliveries.reduce((acc, row) => acc + row.ktonnes, 0);

  // Extract user's deliveries from crop plan (or empty array)
  const userDeliveries: DeliveryEntry[] = userPlan?.deliveries ?? [];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 pb-4">
        <div className="flex items-center gap-3">
          <Link href="/overview">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground flex items-center gap-3">
              <Wheat className="h-8 w-8 text-canola" />
              {grain.name} Market Intelligence
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Detailed {CURRENT_CROP_YEAR} pipeline breakdown comparing macro data with your physical farm scale.
            </p>
          </div>
        </div>
      </div>

      {/* AI Intelligence Section */}
      {intelligence?.thesis_title && (
        <ThesisBanner
          title={intelligence.thesis_title}
          body={intelligence.thesis_body ?? ""}
        />
      )}

      {intelligence?.kpi_data && (
        <IntelligenceKpis data={intelligence.kpi_data as any} />
      )}

      {supplyPipeline && intelligence?.kpi_data?.cy_deliveries_kt != null && (
        <SupplyPipeline
          carry_in_kt={supplyPipeline.carry_in_kt}
          production_kt={supplyPipeline.production_kt}
          total_supply_kt={supplyPipeline.total_supply_kt}
          cy_deliveries_kt={intelligence.kpi_data.cy_deliveries_kt as number}
          grain={grain.name}
        />
      )}

      {intelligence?.insights && intelligence.insights.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-display font-semibold">Market Signals</h2>
          <InsightCards insights={intelligence.insights} />
        </div>
      )}

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <SupplyWidget macro={macro} />
        <FlowBreakdownWidget distribution={distribution} totalDeliveries={totalDeliveries} />
        <StockMapWidget storageData={storageData} />
      </div>

      {/* Gamified 3-Axis Chart */}
      <div className="pt-4">
        <h2 className="text-xl font-display font-semibold mb-4">Delivery Velocity vs Disappearance</h2>
        <GamifiedGrainChart
          weeklyData={weeklyData}
          userDeliveries={userDeliveries}
        />
      </div>

      {/* Contextual Grids */}
      <div className="grid lg:grid-cols-2 gap-8 pt-4">
        {/* Provincial Deliveries */}
        <div className="space-y-4">
          <h2 className="text-lg font-display font-semibold">
            Provincial Deliveries (CY Total)
          </h2>
          <ProvincialCards data={provincial} />
        </div>

        {/* Shipment Distribution */}
        <div className="space-y-4">
          <h2 className="text-lg font-display font-semibold">
            Domestic Disappearance Breakdown
          </h2>
          <DispositionBar data={distribution} />
        </div>
      </div>

    </div>
  );
}

function GrainLockedView({ grain, slug }: { grain: string; slug: string }) {
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Link href="/overview">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-display font-semibold">{grain}</h1>
          <p className="text-sm text-muted-foreground">
            {cropYearLabel()} · Weekly Statistics
          </p>
        </div>
      </div>

      <div className="rounded-xl border-2 border-dashed border-canola/30 bg-canola/5 p-12 text-center space-y-6 max-w-2xl mx-auto mt-12">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-background shadow-sm border border-border">
          <Lock className="h-10 w-10 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h2 className="font-display font-semibold text-2xl text-foreground">
            {grain} analytics are locked
          </h2>
          <p className="text-base text-muted-foreground">
            Add {grain} to your My Farm pipeline to unlock detailed macro-to-micro charts, provincial breakdowns, and actionable trend analysis.
          </p>
        </div>
        <Link href="/my-farm" className="inline-block mt-4">
          <Button className="font-semibold bg-prairie text-foreground hover:bg-prairie/90">
            Set Up My Farm
          </Button>
        </Link>
      </div>
    </div>
  );
}
