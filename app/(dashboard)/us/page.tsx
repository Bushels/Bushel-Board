import Link from "next/link";
import { SectionHeader } from "@/components/dashboard/section-header";
import { SectionStateCard } from "@/components/dashboard/section-state-card";
import { GlassCard } from "@/components/ui/glass-card";
import { formatRecommendationLabel, toUsMarketSlug } from "@/lib/constants/us-markets";
import { getUsMarketDetailData, getUsOverviewData } from "./actions";

export const dynamic = "force-dynamic";

function scoreTone(score: number) {
  if (score >= 20) return "text-prairie";
  if (score <= -20) return "text-destructive";
  return "text-amber-600";
}

export default async function UsOverviewPage() {
  const overview = await getUsOverviewData();
  const details = await Promise.all(
    overview.stances.map((stance) => getUsMarketDetailData(stance.market))
  );

  return (
    <div className="mx-auto max-w-7xl space-y-10 px-4 py-6">
      <section className="space-y-4">
        <SectionHeader
          title="US Grain Thesis Overview"
          subtitle={`US weekly market view for crop year ${overview.cropYear} (market year ${overview.marketYear})`}
        />

        {overview.stances.length === 0 ? (
          <SectionStateCard
            title="US thesis data unavailable"
            message="No stored US weekly theses were found yet. Run the US thesis generator and publish path first."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {overview.stances.map((stance, index) => (
              <GlassCard key={stance.market} index={index} className="transition-colors duration-200 hover:border-canola/30">
                <Link href={`/us/${toUsMarketSlug(stance.market)}`} className="block h-full p-5">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm text-muted-foreground">US market</p>
                        <h3 className="text-xl font-display font-semibold">{stance.market}</h3>
                      </div>
                      <div className={`text-2xl font-bold ${scoreTone(stance.score)}`}>
                        {stance.score > 0 ? `+${stance.score}` : stance.score}
                      </div>
                    </div>

                    <div className="space-y-1 text-sm">
                      <p>
                        <span className="text-muted-foreground">Call:</span>{" "}
                        <span className="font-medium">{formatRecommendationLabel(stance.recommendation)}</span>
                      </p>
                      <p>
                        <span className="text-muted-foreground">Futures:</span>{" "}
                        <span className="font-medium">{stance.futuresPrice ?? "N/A"}</span>
                      </p>
                      <p>
                        <span className="text-muted-foreground">Day change:</span>{" "}
                        <span className="font-medium">
                          {stance.futuresChangePct == null
                            ? "N/A"
                            : `${stance.futuresChangePct > 0 ? "+" : ""}${stance.futuresChangePct.toFixed(3)}%`}
                        </span>
                      </p>
                      <p>
                        <span className="text-muted-foreground">Confidence:</span>{" "}
                        <span className="font-medium uppercase">{stance.confidence}</span>
                      </p>
                    </div>

                    <p className="text-xs font-medium text-canola">Open market page →</p>
                  </div>
                </Link>
              </GlassCard>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <SectionHeader
          title="US Weekly Thesis Cards"
          subtitle="Farmer-facing summary cards for the first US thesis lane"
        />

        <div className="grid gap-4 lg:grid-cols-2">
          {details.map((detail, index) => {
            const stance = overview.stances.find((s) => s.market === detail.marketName);
            if (!detail.analysis || !detail.intelligence || !stance) {
              return (
                <SectionStateCard
                  key={detail.marketName}
                  title={`${detail.marketName} unavailable`}
                  message="This US market has not been published yet."
                />
              );
            }

            return (
              <GlassCard key={detail.marketName} index={index} className="transition-colors duration-200 hover:border-canola/30">
                <Link href={`/us/${toUsMarketSlug(detail.marketName)}`} className="block h-full p-5">
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm text-muted-foreground">{detail.cropYear}</p>
                        <h3 className="text-xl font-display font-semibold">{detail.marketName}</h3>
                      </div>
                      <div className="text-right">
                        <p className={`text-2xl font-bold ${scoreTone(stance.score)}`}>
                          {stance.score > 0 ? `+${stance.score}` : stance.score}
                        </p>
                        <p className="text-sm font-medium text-muted-foreground">{formatRecommendationLabel(stance.recommendation)}</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">Initial thesis</p>
                      <p className="text-sm leading-6">{detail.analysis.initial_thesis}</p>
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">What this means this week</p>
                      <p className="text-sm leading-6">{detail.analysis.final_assessment}</p>
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">Top signals</p>
                      <ul className="space-y-2 text-sm leading-6">
                        {detail.analysis.key_signals.slice(0, 3).map((signal, signalIndex) => (
                          <li key={`${detail.marketName}-${signalIndex}`}>
                            <span className="font-medium">{signal.title}:</span> {signal.body}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <p className="text-xs font-medium text-canola">Open full thesis →</p>
                  </div>
                </Link>
              </GlassCard>
            );
          })}
        </div>
      </section>
    </div>
  );
}
