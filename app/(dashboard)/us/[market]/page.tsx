import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/dashboard/section-header";
import { SectionBoundary } from "@/components/dashboard/section-boundary";
import { SectionStateCard } from "@/components/dashboard/section-state-card";
import { BullBearCards } from "@/components/dashboard/bull-bear-cards";
import { formatRecommendationLabel, getUsMarketBySlug } from "@/lib/constants/us-markets";
import { getUsMarketDetailData } from "../actions";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ market: string }>;
}

export default async function UsMarketDetailPage({ params }: Props) {
  const resolved = await params;
  const marketDef = getUsMarketBySlug(resolved.market);

  if (!marketDef) {
    notFound();
  }

  const detail = await getUsMarketDetailData(marketDef.name);
  if (!detail.analysis || !detail.intelligence || !detail.trajectory) {
    return (
      <div className="mx-auto max-w-5xl space-y-8 px-4 py-6">
        <div className="flex items-center gap-3">
          <Link href="/us">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <p className="text-sm text-muted-foreground">US Markets</p>
            <h1 className="text-2xl font-display font-semibold">{marketDef.name}</h1>
          </div>
        </div>
        <SectionStateCard
          title="US market thesis unavailable"
          message="This market has not been published yet. Run the US thesis generator with --publish first."
        />
      </div>
    );
  }

  const freshness = detail.trajectory.data_freshness ?? {};

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-6">
      <GlassCard hover={false} elevation={3} className="p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <Link href="/us" className="mt-1 shrink-0">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="min-w-0 flex-1 space-y-3">
            <p className="text-sm uppercase tracking-wide text-muted-foreground">US weekly thesis</p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 className="text-3xl font-display font-semibold tracking-tight">{marketDef.name}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Crop year {detail.cropYear} · Market year {detail.marketYear}
                </p>
              </div>
              <div className="text-left sm:text-right">
                <p className="text-3xl font-bold">{detail.trajectory.stance_score > 0 ? `+${detail.trajectory.stance_score}` : detail.trajectory.stance_score}</p>
                <p className="text-sm font-medium text-muted-foreground">{formatRecommendationLabel(detail.trajectory.recommendation)}</p>
              </div>
            </div>
            <p className="text-base leading-7 text-foreground/90">{detail.analysis.final_assessment}</p>
          </div>
        </div>
      </GlassCard>

      <section className="space-y-4">
        <SectionHeader
          title="US Market Thesis"
          subtitle="What is helping, what is hurting, and why the call follows"
        />
        <SectionBoundary
          title="Market thesis unavailable"
          message="The US market thesis is temporarily unavailable. Try refreshing in a minute."
        >
          <BullBearCards
            bullCase={detail.analysis.bull_case}
            bearCase={detail.analysis.bear_case}
            confidence={detail.analysis.data_confidence ?? "medium"}
            confidenceScore={detail.analysis.confidence_score ?? undefined}
            stanceScore={detail.analysis.stance_score}
            initialThesis={detail.analysis.initial_thesis}
            trackedCall={detail.trajectory.trigger ?? undefined}
          />
        </SectionBoundary>
      </section>

      <section className="space-y-4">
        <SectionHeader
          title="Top Signals"
          subtitle="Most important drivers in the current US thesis"
        />
        <SectionBoundary
          title="Top signals unavailable"
          message="Signal cards are temporarily unavailable. Try refreshing in a minute."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            {detail.analysis.key_signals.map((signal, index) => (
              <GlassCard key={`${signal.title}-${index}`} className="p-5" hover={false}>
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{signal.signal} · {signal.source}</p>
                  <h3 className="text-base font-semibold">{signal.title}</h3>
                  <p className="text-sm leading-6">{signal.body}</p>
                </div>
              </GlassCard>
            ))}
          </div>
        </SectionBoundary>
      </section>

      <section className="space-y-4">
        <SectionHeader
          title="Data Freshness"
          subtitle="What this US thesis was built on"
        />
        <SectionBoundary
          title="Freshness metadata unavailable"
          message="Data-freshness details are temporarily unavailable."
        >
          <GlassCard className="p-5" hover={false}>
            <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <p><span className="text-muted-foreground">WASDE month:</span> {String(freshness.wasde_month ?? "N/A")}</p>
              <p><span className="text-muted-foreground">Export sales week:</span> {String(freshness.export_sales_week ?? "N/A")}</p>
              <p><span className="text-muted-foreground">Crop progress week:</span> {String(freshness.crop_progress_week ?? "N/A")}</p>
              <p><span className="text-muted-foreground">Price date:</span> {String(freshness.price_date ?? "N/A")}</p>
              <p><span className="text-muted-foreground">COT report:</span> {String(freshness.cot_report_date ?? "N/A")}</p>
              <p><span className="text-muted-foreground">Generated:</span> {detail.analysis.generated_at}</p>
            </div>
          </GlassCard>
        </SectionBoundary>
      </section>
    </div>
  );
}
