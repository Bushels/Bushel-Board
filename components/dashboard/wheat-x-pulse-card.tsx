import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  wheatXLeanLabel,
  type WheatXSentimentResult,
} from "@/lib/thesis/x-pulse-sentiment";
import { cn } from "@/lib/utils";

function formatMt(value: string | null): string {
  if (!value) return "Not stamped";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Edmonton",
    timeZoneName: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function leanClass(lean: WheatXSentimentResult["lean"]): string {
  if (lean.includes("bullish")) return "border-prairie/30 bg-prairie/10 text-prairie";
  if (lean.includes("bearish")) {
    return "border-orange-600/30 bg-orange-500/10 text-orange-700 dark:text-orange-300";
  }
  return "border-border bg-background/80 text-muted-foreground";
}

function alignmentClass(alignment: WheatXSentimentResult["tensionAlignment"]): string {
  if (alignment === "aligned") return "border-prairie/25 bg-prairie/8 text-foreground";
  if (alignment === "divergent") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-950 dark:text-amber-100";
  }
  if (alignment === "quiet") return "border-border bg-muted/30 text-muted-foreground";
  return "border-border bg-background text-muted-foreground";
}

function watchClass(sentiment: WheatXSentimentResult["thematicWatches"][number]["sentiment"]): string {
  if (sentiment === "bullish_watch") return "border-prairie/20 bg-prairie/8";
  if (sentiment === "bearish_watch") return "border-orange-600/20 bg-orange-500/8";
  return "border-border bg-background/80";
}

export function WheatXPulseCard({
  sentiment,
  auditMode = false,
}: {
  sentiment: WheatXSentimentResult;
  auditMode?: boolean;
}) {
  const { rankingNotes, dataProvenance } = sentiment;
  const weights = rankingNotes.weights;

  return (
    <section
      className="scroll-mt-28 rounded-lg border border-canola/25 bg-background p-4 shadow-sm"
      aria-labelledby="wheat-x-pulse-heading"
      data-testid="wheat-x-pulse-card"
      data-score-authority="watch_only"
      data-x-lean={sentiment.lean}
      data-tension-alignment={sentiment.tensionAlignment}
      data-x-score={String(sentiment.wheatSentimentScore)}
    >
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Wheat X Pulse · watch-only
          </p>
          <h2
            id="wheat-x-pulse-heading"
            className="font-display text-xl font-semibold leading-tight text-foreground"
          >
            What X is saying about Wheat
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Field and market chatter ranked for the desk. This never moves the official Bull/Bear score.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className={cn("w-fit", leanClass(sentiment.lean))}>
            {wheatXLeanLabel(sentiment.lean)}
          </Badge>
          <Badge variant="outline" className="w-fit border-border bg-background/80 text-muted-foreground">
            Score {sentiment.wheatSentimentScore} · trust {Math.round(sentiment.confidence * 100)}%
          </Badge>
        </div>
      </div>

      {/* Desk impact strip — always visible for swarm reference */}
      <div
        className={cn("mb-4 rounded-lg border px-3 py-3 text-sm leading-6", alignmentClass(sentiment.tensionAlignment))}
        data-testid="wheat-x-pulse-tension"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Tension vs official board · {sentiment.tensionAlignment}
        </p>
        <p className="mt-1 text-foreground">{sentiment.tensionNote}</p>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Official board stance used for comparison: <span className="font-medium text-foreground">{sentiment.boardStance}</span>
          {" · "}
          Desk impact: {rankingNotes.deskImpact}
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Provenance · where this came from
            </p>
            <ul className="mt-2 space-y-1 text-xs leading-5 text-muted-foreground">
              <li>
                <span className="font-medium text-foreground">Tables:</span>{" "}
                {dataProvenance.sourceTables.join(", ")}
              </li>
              <li>
                <span className="font-medium text-foreground">Scout:</span>{" "}
                {dataProvenance.scoutRunner ?? "none stored"} / {dataProvenance.scoutMode ?? "n/a"}
              </li>
              <li>
                <span className="font-medium text-foreground">Run date:</span>{" "}
                {dataProvenance.runDate ?? "—"} · started {formatMt(dataProvenance.runStartedAt)}
              </li>
              <li>
                <span className="font-medium text-foreground">Recency:</span> {dataProvenance.recencyLabel}
              </li>
              <li>
                <span className="font-medium text-foreground">Trust:</span> {dataProvenance.trustLabel}
              </li>
              <li>
                <span className="font-medium text-foreground">Accepted / rejected:</span>{" "}
                {dataProvenance.acceptedSignalCount} / {dataProvenance.rejectedSignalCount}
                {dataProvenance.priceSnapshotStatus
                  ? ` · price snapshot ${dataProvenance.priceSnapshotStatus}`
                  : ""}
              </li>
              {dataProvenance.artifactPath ? (
                <li className="break-all">
                  <span className="font-medium text-foreground">Artifact:</span> {dataProvenance.artifactPath}
                </li>
              ) : null}
            </ul>
          </div>

          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              How we rank posts
            </p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{rankingNotes.methodSummary}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
              <div className="rounded-md border border-border bg-background px-2 py-1.5">
                Source tier <span className="font-semibold tabular-nums">{Math.round(weights.sourceTier * 100)}%</span>
              </div>
              <div className="rounded-md border border-border bg-background px-2 py-1.5">
                Location <span className="font-semibold tabular-nums">{Math.round(weights.location * 100)}%</span>
              </div>
              <div className="rounded-md border border-border bg-background px-2 py-1.5">
                Direction×conf{" "}
                <span className="font-semibold tabular-nums">
                  {Math.round(weights.directionTimesConfidence * 100)}%
                </span>
              </div>
              <div className="rounded-md border border-border bg-background px-2 py-1.5">
                Recency <span className="font-semibold tabular-nums">{Math.round(weights.recency * 100)}%</span>
              </div>
              <div className="rounded-md border border-border bg-background px-2 py-1.5">
                Corroboration{" "}
                <span className="font-semibold tabular-nums">{Math.round(weights.corroboration * 100)}%</span>
              </div>
              <div className="rounded-md border border-canola/25 bg-canola/8 px-2 py-1.5">
                Score authority <span className="font-semibold">none</span>
              </div>
            </div>
            {auditMode ? (
              <div className="mt-3 space-y-2 border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
                <p className="font-semibold text-foreground">Admission rules</p>
                <ul className="list-disc space-y-1 pl-4">
                  {rankingNotes.admissionRules.map((rule) => (
                    <li key={rule}>{rule}</li>
                  ))}
                </ul>
                <p className="font-semibold text-foreground">Trust rules</p>
                <ul className="list-disc space-y-1 pl-4">
                  {rankingNotes.trustRules.map((rule) => (
                    <li key={rule}>{rule}</li>
                  ))}
                </ul>
                <p>{rankingNotes.scoreAuthority}</p>
              </div>
            ) : (
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                {rankingNotes.scoreAuthority} Open <code className="text-[11px]">/thesis?audit=1</code> for full
                admission and trust rule lists.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Top ranked Wheat posts
              </p>
              <Badge variant="outline" className="border-border bg-background/70 text-muted-foreground">
                {sentiment.signalCount} Wheat · {sentiment.prairieSignalCount} prairie
              </Badge>
            </div>
            {sentiment.topSignals.length === 0 ? (
              <p className="text-sm leading-6 text-muted-foreground">
                No accepted Wheat posts in the latest pulse. Quiet days are valid evidence of low chatter, not a
                bullish or bearish call.
              </p>
            ) : (
              <div className="space-y-2">
                {sentiment.topSignals.map((signal) => (
                  <div key={signal.id} className="rounded-md border border-border bg-background/80 p-3">
                    <div className="mb-1.5 flex flex-wrap gap-1.5">
                      <Badge variant="outline" className={cn("text-[10px]", leanClass(signal.direction === "bullish" ? "lean_bullish" : signal.direction === "bearish" ? "lean_bearish" : "neutral"))}>
                        {signal.direction}
                      </Badge>
                      <Badge variant="outline" className="border-border bg-muted/40 text-[10px] text-muted-foreground">
                        {signal.tier}
                      </Badge>
                      <Badge variant="outline" className="border-border bg-muted/40 text-[10px] text-muted-foreground">
                        contrib {signal.weightedContribution}
                      </Badge>
                      {signal.needsOfficialVerification ? (
                        <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-800 dark:text-amber-200">
                          needs official check
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-sm leading-6 text-foreground">{signal.quote}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      @{signal.handle}
                      {signal.regions.length ? ` · ${signal.regions.join(", ")}` : ""}
                      {signal.postedAt ? ` · ${formatMt(signal.postedAt)}` : ""}
                      {" · "}tier w {signal.tierWeight.toFixed(2)} · loc w {signal.locationWeight.toFixed(2)} · recency w{" "}
                      {signal.recencyWeight.toFixed(2)}
                    </p>
                    {signal.url ? (
                      <Link
                        href={signal.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-block text-xs font-semibold text-canola hover:text-canola/80"
                      >
                        Open post
                      </Link>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Standing watches (follow even if quiet)
            </p>
            <div className="mt-2 space-y-2">
              {sentiment.thematicWatches.map((watch) => (
                <div key={watch.id} className={cn("rounded-md border p-3", watchClass(watch.sentiment))}>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">{watch.label}</p>
                    <Badge variant="outline" className="border-border bg-background/70 text-[10px] text-muted-foreground">
                      {watch.sentiment.replaceAll("_", " ")}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{watch.summary}</p>
                  <p className="mt-1 text-xs leading-5 text-foreground">
                    <span className="font-medium">Why it matters:</span> {watch.whyItMatters}
                  </p>
                  <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{watch.trustNote}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <p className="mt-4 border-t border-border pt-3 text-[11px] leading-5 text-muted-foreground">
        Swarm desk reference: use <span className="font-medium text-foreground">wheatSentimentScore</span> (
        {sentiment.wheatSentimentScore}) and <span className="font-medium text-foreground">tensionAlignment</span> (
        {sentiment.tensionAlignment}) as watch context only. Impact on thesis score ={" "}
        <span className="font-medium text-foreground">0</span>. Friday desks may cite this card when explaining
        conviction or early weather leads, but must still ground the published read in official packet rows.
      </p>
    </section>
  );
}
