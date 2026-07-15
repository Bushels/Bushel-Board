"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";

import type {
  CropLean,
  CropProgressSignal,
  GeeBeltChip,
  GeeMoistureCardModel,
  GeographyCropRead,
  PrairieProgressCardModel,
  PrairieProvincePill,
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

/** Stylized Prairie trio — not geo-precise; AB west → SK → MB east. */
function PrairieMiniMap({
  provinces,
  reduce,
}: {
  provinces: PrairieProvincePill[];
  reduce: boolean | null;
}) {
  const byCode = Object.fromEntries(provinces.map((p) => [p.code, p])) as Record<
    string,
    PrairieProvincePill | undefined
  >;
  // Geographic west→east for the map visual.
  const order = [
    { code: "AB" as const, d: "M8 28h52v52H8z", labelX: 34, labelY: 58 },
    { code: "SK" as const, d: "M66 18h68v72H66z", labelX: 100, labelY: 58 },
    { code: "MB" as const, d: "M140 30h52v50h-52z", labelX: 166, labelY: 58 },
  ];

  return (
    <div data-testid="wheat-prairie-mini-map" className="rounded-2xl border border-white/30 bg-background/40 p-2 dark:border-white/10">
      <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        Prairie map
      </p>
      <svg viewBox="0 0 200 100" className="h-auto w-full" role="img" aria-label="Prairie package map for Alberta, Saskatchewan, and Manitoba">
        <rect x="0" y="0" width="200" height="100" rx="12" className="fill-wheat-100/40 dark:fill-white/5" />
        {order.map((shape, i) => {
          const p = byCode[shape.code];
          const present = p?.present ?? false;
          const fill = present ? "var(--canola, #c4a035)" : "var(--muted, #d6d0c2)";
          const opacity = present ? (p?.progressPct != null ? 0.55 + (p.progressPct / 100) * 0.4 : 0.75) : 0.28;
          return (
            <g key={shape.code}>
              <motion.path
                d={shape.d}
                fill={fill}
                fillOpacity={opacity}
                stroke="rgba(42,38,30,0.25)"
                strokeWidth={1.2}
                initial={reduce ? false : { opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.45, delay: reduce ? 0 : i * 0.08, ease: [0.16, 1, 0.3, 1] }}
                style={{ transformOrigin: "center" }}
              />
              <text
                x={shape.labelX}
                y={shape.labelY}
                textAnchor="middle"
                className="fill-foreground text-[11px] font-semibold"
                style={{ fontSize: 12, fontWeight: 600 }}
              >
                {shape.code}
              </text>
              <text
                x={shape.labelX}
                y={shape.labelY + 14}
                textAnchor="middle"
                style={{ fontSize: 9, fill: "currentColor", opacity: 0.65 }}
              >
                {present ? (p?.progressPct != null ? `${Math.round(p.progressPct)}%` : "in") : "wait"}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Lightweight belt thumbnail — Mapbox stays on /data. */
function GeeMiniMapThumbnail({
  belts,
  reduce,
}: {
  belts: GeeBeltChip[];
  reduce: boolean | null;
}) {
  const byBelt = Object.fromEntries(belts.map((b) => [b.cropBelt, b]));
  const slots = [
    { id: "US_HRW", label: "US HRW", x: 8, w: 58 },
    { id: "RU_WINTER", label: "RU winter", x: 72, w: 58 },
    { id: "RU_SPRING", label: "RU spring", x: 136, w: 56 },
  ];

  return (
    <div
      data-testid="wheat-gee-mini-map"
      className="rounded-2xl border border-white/30 bg-background/40 p-2 dark:border-white/10"
    >
      <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        Stress thumbnail
      </p>
      <svg viewBox="0 0 200 72" className="h-auto w-full" role="img" aria-label="Crop-stress belt thumbnail">
        <rect x="0" y="0" width="200" height="72" rx="10" className="fill-wheat-100/40 dark:fill-white/5" />
        {slots.map((slot, i) => {
          const belt = byBelt[slot.id];
          const color = belt?.color ?? "#d6d0c2";
          return (
            <g key={slot.id}>
              <motion.rect
                x={slot.x}
                y={14}
                width={slot.w}
                height={36}
                rx={8}
                fill={color}
                initial={reduce ? false : { opacity: 0.35 }}
                animate={
                  reduce || !belt
                    ? { opacity: belt ? 0.9 : 0.35 }
                    : { opacity: [0.55, 0.95, 0.55] }
                }
                transition={
                  reduce || !belt
                    ? { duration: 0.35, delay: i * 0.05 }
                    : { duration: 2.4, delay: i * 0.15, repeat: Infinity, ease: "easeInOut" }
                }
              />
              <text
                x={slot.x + slot.w / 2}
                y={64}
                textAnchor="middle"
                style={{ fontSize: 9, fill: "currentColor", opacity: 0.7 }}
              >
                {slot.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function PriceAgreementStrip({
  model,
  reduce,
}: {
  model: PriceBasketCardModel;
  reduce: boolean | null;
}) {
  const tone =
    model.agreement === "up"
      ? "text-prairie"
      : model.agreement === "down"
        ? "text-error"
        : "text-muted-foreground";

  return (
    <div
      data-testid="wheat-price-agreement"
      className="mt-3 rounded-2xl border border-white/30 bg-background/40 px-3 py-2 dark:border-white/10"
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        Agreement motion
      </p>
      <div className="mt-2 flex h-10 items-end justify-center gap-3">
        {model.legs.map((leg, i) => {
          const change = leg.changePct ?? 0;
          const up = change >= 0;
          const height =
            model.agreement === "split"
              ? 18 + Math.min(18, Math.abs(change) * 4)
              : model.agreement === "neutral"
                ? 16
                : 22 + Math.min(14, Math.abs(change) * 3);
          const xShift =
            model.agreement === "split" ? (i === 0 ? -6 : i === 2 ? 6 : 0) : 0;
          const yShift =
            model.agreement === "up" ? -4 : model.agreement === "down" ? 4 : 0;
          return (
            <div key={leg.symbol} className="flex w-12 flex-col items-center gap-1">
              <motion.div
                className={cn(
                  "w-3 rounded-full",
                  model.agreement === "up"
                    ? "bg-prairie"
                    : model.agreement === "down"
                      ? "bg-error"
                      : up
                        ? "bg-prairie/70"
                        : "bg-error/70",
                )}
                initial={reduce ? false : { height: 8, x: 0, y: 0 }}
                animate={{ height, x: xShift, y: yShift }}
                transition={{ duration: 0.55, delay: reduce ? 0 : i * 0.07, ease: [0.16, 1, 0.3, 1] }}
              />
              <span className="text-[10px] text-muted-foreground">{leg.symbol === "Spring Wheat" ? "Spr" : leg.symbol}</span>
            </div>
          );
        })}
      </div>
      <p className={cn("mt-1 text-center text-xs font-medium", tone)}>{model.agreementLabel}</p>
    </div>
  );
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

        <div className="mt-3">
          <PrairieMiniMap provinces={model.provinces} reduce={reduce} />
        </div>

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
  const reduce = useReducedMotion();

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

        <div className="mt-3">
          <Link
            href={model.dataHref}
            className="block rounded-2xl outline-none ring-offset-2 transition hover:opacity-95 focus-visible:ring-2 focus-visible:ring-canola"
            aria-label="Open full Wheat Data crop-stress map"
          >
            <GeeMiniMapThumbnail belts={model.belts} reduce={reduce} />
          </Link>
        </div>

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

        <PriceAgreementStrip model={model} reduce={reduce} />

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

/**
 * Farmer visual pillars.
 * Mobile: vertical stack (smoke/scroll-reachable). Desktop: 3-column grid.
 * Phase 2 map/motion polish lives inside each card.
 */
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
