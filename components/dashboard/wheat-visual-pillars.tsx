"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";

import type {
  CropLean,
  CropProgressSignal,
  GeeMoistureCardModel,
  GeographyCropRead,
  PrairieProgressCardModel,
  PriceBasketCardModel,
} from "@/lib/thesis/wheat-cockpit-models";
import { AnimatedCard } from "@/components/motion/animated-card";
import { cn } from "@/lib/utils";

function packageBadgeClass(status: PrairieProgressCardModel["packageStatus"]): string {
  if (status === "complete_mb_sk_ab") {
    return "bg-prairie/15 text-prairie border-prairie/30";
  }
  if (status === "empty" || status === "unknown") {
    return "bg-muted text-muted-foreground border-border";
  }
  return "bg-amber-500/15 text-amber-800 dark:text-amber-200 border-amber-500/30";
}

function leanBadgeClass(lean: CropLean): string {
  if (lean === "bull") return "border-prairie/30 bg-prairie/10 text-prairie";
  if (lean === "bear") return "border-orange-600/30 bg-orange-500/10 text-orange-700 dark:text-orange-300";
  if (lean === "balanced") return "border-border bg-background/70 text-muted-foreground";
  return "border-border bg-muted/40 text-muted-foreground";
}

function signalValueClass(lean: CropLean): string {
  if (lean === "bull") return "text-prairie";
  if (lean === "bear") return "text-orange-700 dark:text-orange-300";
  return "text-foreground";
}

function GeographyReadBlock({ read }: { read: GeographyCropRead }) {
  return (
    <div
      data-testid={read.code === "CA" ? "wheat-crop-ca" : "wheat-crop-us"}
      className="rounded-2xl border border-white/30 bg-background/45 p-3 dark:border-white/10"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {read.code === "CA" ? "Canada" : "United States"}
          </p>
          <p className="mt-0.5 text-sm font-semibold text-foreground">{read.label}</p>
        </div>
        <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium", leanBadgeClass(read.lean))}>
          {read.leanLabel}
        </span>
      </div>
      {read.weekEnding ? (
        <p className="mt-1 text-[11px] text-muted-foreground">Week ending {read.weekEnding}</p>
      ) : null}
      {read.scoreHint ? (
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{read.scoreHint}</p>
      ) : null}

      <div className="mt-2 space-y-1.5">
        {read.signals.length === 0 ? (
          <p className="text-xs text-muted-foreground">No scored condition metric yet for this side.</p>
        ) : (
          read.signals.map((signal: CropProgressSignal, index) => (
            <div
              key={`${read.code}-${signal.label}-${index}`}
              className="flex items-baseline justify-between gap-2 text-xs"
            >
              <span className="min-w-0 text-muted-foreground">
                {signal.label}
                {signal.scores ? (
                  <span className="ml-1 rounded bg-canola/15 px-1 py-px text-[10px] font-medium text-canola">
                    scores
                  </span>
                ) : null}
              </span>
              <span className={cn("shrink-0 tabular-nums font-medium", signalValueClass(signal.lean))}>
                {signal.value}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function PrairieProgressPillar({ model }: { model: PrairieProgressCardModel }) {
  const reduce = useReducedMotion();

  return (
    <AnimatedCard index={0} className="h-full">
      <section
        data-testid="wheat-pillar-prairie"
        className="flex h-full flex-col rounded-3xl border border-white/40 bg-white/55 p-4 shadow-[0_18px_40px_-28px_rgba(42,38,30,0.55)] backdrop-blur-xl dark:border-white/10 dark:bg-white/5"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Crop progress
            </p>
            <h3 className="mt-1 font-display text-lg font-semibold text-foreground">
              Prairie + US condition
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">MB · SK · AB this week</p>
          </div>
          <span
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] font-medium",
              packageBadgeClass(model.packageStatus),
            )}
          >
            {model.packageLabel}
          </span>
        </div>

        {model.weekEnding ? (
          <p className="mt-1 text-xs text-muted-foreground">Package week ending {model.weekEnding}</p>
        ) : null}

        <div className="mt-3 grid gap-2">
          <GeographyReadBlock read={model.canada} />
          <GeographyReadBlock read={model.us} />
        </div>

        <div className="mt-3 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Prairie package
          </p>
          {model.provinces.map((p, i) => {
            const width = p.progressPct == null ? 0 : Math.max(0, Math.min(100, p.progressPct));
            return (
              <div key={p.code}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">{p.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {p.present ? (p.progressPct != null ? `${Math.round(width)}%` : "in") : "waiting"}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-wheat-200/60 dark:bg-white/10">
                  <motion.div
                    className={cn(
                      "h-full rounded-full",
                      p.present ? "bg-canola" : "bg-muted-foreground/30",
                    )}
                    initial={reduce ? false : { width: 0 }}
                    animate={{ width: `${width}%` }}
                    transition={{ duration: 0.55, delay: reduce ? 0 : i * 0.08, ease: [0.16, 1, 0.3, 1] }}
                  />
                </div>
                {p.detail ? (
                  <p className="mt-1 text-xs leading-snug text-muted-foreground">{p.detail}</p>
                ) : null}
              </div>
            );
          })}
        </div>

        <p className="mt-auto pt-3 text-sm leading-6 text-foreground">{model.takeaway}</p>
      </section>
    </AnimatedCard>
  );
}

export function GeeMoisturePillar({ model }: { model: GeeMoistureCardModel }) {
  return (
    <AnimatedCard index={1} className="h-full">
      <section
        data-testid="wheat-pillar-gee"
        className="flex h-full flex-col rounded-3xl border border-white/40 bg-white/55 p-4 shadow-[0_18px_40px_-28px_rgba(42,38,30,0.55)] backdrop-blur-xl dark:border-white/10 dark:bg-white/5"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Satellite moisture
            </p>
            <h3 className="mt-1 font-display text-lg font-semibold text-foreground">
              Crop-stress belts
            </h3>
          </div>
          <span className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            Watch-only
          </span>
        </div>

        {model.latestWeek ? (
          <p className="mt-1 text-xs text-muted-foreground">Week ending {model.latestWeek}</p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {model.belts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No fresh GEE reading yet — Friday collector publishes belt stress.
            </p>
          ) : (
            model.belts.map((b) => (
              <div
                key={b.cropBelt}
                className="min-w-[7.5rem] flex-1 rounded-2xl border border-white/35 bg-background/50 px-3 py-2 dark:border-white/10"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 rounded-full ring-1 ring-black/10"
                    style={{ backgroundColor: b.color }}
                    aria-hidden
                  />
                  <span className="text-xs font-medium text-foreground">{b.label}</span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {b.reading ?? "no reading"}
                  {b.stressIndex != null ? ` · ${b.stressIndex.toFixed(2)}` : ""}
                </p>
              </div>
            ))
          )}
        </div>

        <p className="mt-4 text-sm leading-6 text-foreground">{model.takeaway}</p>

        <Link
          href={model.dataHref}
          className="mt-auto inline-flex pt-4 text-sm font-medium text-canola underline-offset-4 hover:underline"
        >
          Open full Wheat Data map →
        </Link>
      </section>
    </AnimatedCard>
  );
}

export function PriceBasketPillar({ model }: { model: PriceBasketCardModel }) {
  const reduce = useReducedMotion();

  return (
    <AnimatedCard index={2} className="h-full">
      <section
        data-testid="wheat-pillar-prices"
        className="flex h-full flex-col rounded-3xl border border-white/40 bg-white/55 p-4 shadow-[0_18px_40px_-28px_rgba(42,38,30,0.55)] backdrop-blur-xl dark:border-white/10 dark:bg-white/5"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Price proof
            </p>
            <h3 className="mt-1 font-display text-lg font-semibold text-foreground">
              Spring · HRW · SRW
            </h3>
          </div>
          <span className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            {model.agreementLabel}
          </span>
        </div>

        <div className="mt-4 grid gap-3">
          {model.legs.map((leg, i) => {
            const max = Math.max(...leg.series, 1);
            const min = Math.min(...leg.series, 0);
            const span = Math.max(max - min, 0.01);
            return (
              <div key={leg.symbol} className="rounded-2xl border border-white/30 bg-background/40 px-3 py-2 dark:border-white/10">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">{leg.symbol}</span>
                  <span className="text-sm tabular-nums text-foreground">
                    {leg.lastPrice != null ? `$${leg.lastPrice.toFixed(2)}` : "—"}
                    {leg.changePct != null ? (
                      <span
                        className={cn(
                          "ml-2 text-xs",
                          leg.changePct >= 0 ? "text-prairie" : "text-error",
                        )}
                      >
                        {leg.changePct >= 0 ? "+" : ""}
                        {leg.changePct.toFixed(2)}%
                      </span>
                    ) : null}
                  </span>
                </div>
                {leg.series.length > 1 ? (
                  <div className="mt-2 flex h-8 items-end gap-0.5">
                    {leg.series.map((v, idx) => {
                      const h = ((v - min) / span) * 100;
                      return (
                        <motion.div
                          key={`${leg.symbol}-${idx}`}
                          className="flex-1 rounded-t bg-wheat-600/70 dark:bg-wheat-400/50"
                          initial={reduce ? false : { height: 0 }}
                          animate={{ height: `${Math.max(8, h)}%` }}
                          transition={{ duration: 0.4, delay: reduce ? 0 : i * 0.05 + idx * 0.01 }}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">Sparse history on this leg</p>
                )}
              </div>
            );
          })}
        </div>

        <p className="mt-auto pt-4 text-sm leading-6 text-foreground">{model.takeaway}</p>
      </section>
    </AnimatedCard>
  );
}

/** Horizontal swipe row of the three farmer pillars (Phase 1 shell). */
export function WheatVisualPillars({
  prairie,
  gee,
  prices,
}: {
  prairie: PrairieProgressCardModel;
  gee: GeeMoistureCardModel;
  prices: PriceBasketCardModel;
}) {
  return (
    <div
      data-testid="wheat-visual-pillars"
      className="grid gap-4 md:grid-cols-3"
    >
      <PrairieProgressPillar model={prairie} />
      <GeeMoisturePillar model={gee} />
      <PriceBasketPillar model={prices} />
    </div>
  );
}
