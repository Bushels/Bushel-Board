"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { JSX } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import type { DrillData } from "@/lib/queries/seeding-drill-utils";
import {
  TrajectoryChart,
  ConditionBar,
  FuturesSparkline,
} from "@/components/dashboard/seeding-drill-charts";
import { cn } from "@/lib/utils";

const EASE = [0.16, 1, 0.3, 1] as const;

interface Props {
  stateCode: string;
  commodity: string;
  currentWeek?: string;
  onClose: () => void;
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function fmtPct(v: number | null): string {
  return v === null ? "—" : `${Math.round(v)}%`;
}

function signedBadge(v: number | null): { text: string; color: string } {
  if (v === null) return { text: "—", color: "text-muted-foreground" };
  const r = Math.round(v);
  if (r > 0) return { text: `+${r} pts`, color: "text-prairie" };
  if (r < 0) return { text: `${r} pts`, color: "text-warning" };
  return { text: "flat", color: "text-muted-foreground" };
}

function wowBadge(pct: number | null): { text: string; color: string } {
  if (pct === null) return { text: "—", color: "text-muted-foreground" };
  const r = pct.toFixed(1);
  if (pct > 0) return { text: `+${r}%`, color: "text-prairie" };
  if (pct < 0) return { text: `${r}%`, color: "text-warning" };
  return { text: "flat", color: "text-muted-foreground" };
}

function SkeletonBlock({ className }: { className?: string }): JSX.Element {
  return (
    <div
      className={cn(
        "animate-pulse rounded-lg bg-wheat-200/60 dark:bg-wheat-700/30",
        className,
      )}
    />
  );
}

function LoadingSkeleton(): JSX.Element {
  return (
    <div className="space-y-4 p-5">
      <SkeletonBlock className="h-8 w-2/3" />
      <SkeletonBlock className="h-4 w-1/2" />
      <SkeletonBlock className="h-[130px] w-full" />
      <SkeletonBlock className="h-6 w-full" />
      <SkeletonBlock className="h-[90px] w-full" />
      <SkeletonBlock className="h-4 w-3/4" />
      <SkeletonBlock className="h-4 w-2/3" />
    </div>
  );
}

/** Thin separator used between sections */
function Sep(): JSX.Element {
  return <hr className="border-border/30" />;
}

interface SectionProps {
  label: string;
  children: React.ReactNode;
}

function Section({ label, children }: SectionProps): JSX.Element {
  return (
    <div className="space-y-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

export function SeedingDrillPanel({
  stateCode,
  commodity,
  currentWeek,
  onClose,
}: Props): JSX.Element {
  const reducedMotion = useReducedMotion() === true;
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [data, setData] = useState<DrillData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch drill data
  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    fetch(
      `/api/seeding/drill?state=${encodeURIComponent(stateCode)}&crop=${encodeURIComponent(commodity)}`,
    )
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<DrillData>;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load data");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [stateCode, commodity]);

  // ESC key dismiss
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Click-outside dismiss — clicking the overlay backdrop behind the panel
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    },
    [onClose],
  );

  const slideVariants = reducedMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, x: 60 },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: 60 },
      };

  return (
    // Backdrop overlay — fills the GlassCard, click outside panel dismisses
    <div
      className="absolute inset-0 z-40"
      onClick={handleBackdropClick}
      aria-hidden="true"
    >
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-label={`${stateCode} ${titleCase(commodity)} drill-down`}
        aria-modal="true"
        className={cn(
          // Desktop: fixed-width panel from right edge
          "absolute bottom-0 right-0 top-0 w-full overflow-y-auto",
          "sm:w-[420px]",
          // Mobile (<768px): full-width bottom sheet
          "md:w-[420px]",
          // Glassmorphism
          "border-l border-border/40 bg-card/90 shadow-lg backdrop-blur-xl backdrop-saturate-150",
        )}
        initial={slideVariants.initial}
        animate={slideVariants.animate}
        exit={slideVariants.exit}
        transition={{ duration: reducedMotion ? 0.12 : 0.28, ease: EASE }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border/30 bg-card/95 px-5 py-4 backdrop-blur-md">
          <div className="min-w-0">
            <p className="font-display text-xl font-semibold leading-tight text-foreground">
              {data?.state_name ?? stateCode}
            </p>
            <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {titleCase(commodity)}
              {(currentWeek ?? data?.current_week) && (
                <> · Week {currentWeek ?? data?.current_week}</>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close drill-down panel"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/40 bg-card/60 text-muted-foreground transition-colors hover:bg-canola/10 hover:text-foreground"
          >
            <X size={14} strokeWidth={2.5} />
          </button>
        </div>

        {/* Body */}
        {error ? (
          <div className="p-5 text-center text-sm text-error">
            Could not load data: {error}
          </div>
        ) : !data ? (
          <LoadingSkeleton />
        ) : (
          <div className="space-y-5 p-5">
            {/* ── Headline KPIs ── */}
            <Section label="This week">
              <div className="grid grid-cols-2 gap-2.5">
                <KpiTile
                  label="Planted"
                  value={fmtPct(
                    data.season.at(-1)?.planted_pct ?? null,
                  )}
                />
                <KpiTile
                  label="Emerged"
                  value={fmtPct(
                    data.season.at(-1)?.emerged_pct ?? null,
                  )}
                />
                <KpiTile
                  label="Good / Excellent"
                  value={fmtPct(data.ge_pct)}
                  badge={signedBadge(data.ge_yoy_change)}
                />
                {data.futures?.last_settle !== null &&
                  data.futures?.last_settle !== undefined && (
                    <KpiTile
                      label={`${data.futures.ticker} settle`}
                      value={`$${data.futures.last_settle.toFixed(2)}`}
                      badge={wowBadge(data.futures.wow_pct)}
                    />
                  )}
              </div>
            </Section>

            <Sep />

            {/* ── Planting Progress Chart ── */}
            <Section label="Planting progress vs 5-yr avg">
              <TrajectoryChart
                season={data.season}
                fiveYearAvg={data.five_year_avg}
              />
              <p className="text-[10px] text-muted-foreground/70">
                Solid = {new Date().getFullYear()} · Dashed = 5-year average
              </p>
            </Section>

            {/* ── Crop Condition Bar ── */}
            {data.condition_segments && data.condition_segments.length > 0 && (
              <>
                <Sep />
                <Section label="Crop condition (latest week)">
                  <ConditionBar segments={data.condition_segments} />
                </Section>
              </>
            )}

            {/* ── Futures Sparkline ── */}
            {data.futures && data.futures.points.length > 0 && (
              <>
                <Sep />
                <Section label={`${data.futures.contract_label} — 90-day`}>
                  <FuturesSparkline
                    points={data.futures.points}
                    contractLabel={data.futures.contract_label}
                  />
                </Section>
              </>
            )}

            {/* ── WASDE Outlook ── */}
            {data.wasde && (
              <>
                <Sep />
                <Section label="WASDE outlook">
                  <WasdeOutlookBlock wasde={data.wasde} commodity={data.commodity} />
                </Section>
              </>
            )}

            {/* ── Cash Bids ── */}
            <Sep />
            <Section label="Local cash bids">
              {data.cash_bids.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No local cash bids posted yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {data.cash_bids.map((bid, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-2 rounded-xl border border-border/35 bg-wheat-50/70 px-3 py-2.5 text-sm dark:bg-wheat-800/50"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">
                          {bid.facility_name}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {bid.fsa_code}
                          {bid.distance_km !== null &&
                            ` · ${Math.round(bid.distance_km)} km`}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="tabular-nums font-bold text-foreground">
                          {bid.cash_price !== null
                            ? `$${bid.cash_price.toFixed(2)}`
                            : "—"}
                        </p>
                        {bid.basis !== null && (
                          <p className="tabular-nums text-[11px] text-muted-foreground">
                            basis {bid.basis > 0 ? "+" : ""}
                            {bid.basis.toFixed(2)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Footer attribution */}
            <p className="text-[10px] text-muted-foreground/60">
              USDA NASS crop progress · CBOT futures via Yahoo Finance · WASDE
              via USDA FAS
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

interface KpiTileProps {
  label: string;
  value: string;
  badge?: { text: string; color: string };
}

function KpiTile({ label, value, badge }: KpiTileProps): JSX.Element {
  return (
    <div className="rounded-xl border border-border/35 bg-wheat-50/70 px-3 py-2.5 dark:bg-wheat-800/50">
      <p className="tabular-nums text-lg font-bold leading-tight text-foreground">
        {value}
      </p>
      {badge && badge.text !== "—" && (
        <p className={cn("tabular-nums text-[11px] font-semibold", badge.color)}>
          {badge.text}
        </p>
      )}
      <p className="mt-0.5 text-[10px] font-medium text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

interface WasdeOutlookBlockProps {
  wasde: NonNullable<DrillData["wasde"]>;
  commodity: string;
}

function WasdeOutlookBlock({ wasde, commodity }: WasdeOutlookBlockProps): JSX.Element {
  const dirArrow =
    wasde.mom_revision_direction === "up"
      ? "↑"
      : wasde.mom_revision_direction === "down"
        ? "↓"
        : null;
  const dirColor =
    wasde.mom_revision_direction === "up"
      ? "text-prairie"
      : wasde.mom_revision_direction === "down"
        ? "text-warning"
        : "text-muted-foreground";

  return (
    <div className="space-y-2">
      {wasde.report_month && (
        <p className="text-[11px] text-muted-foreground">
          Report: {wasde.report_month}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2.5">
        {wasde.ending_stocks_kt !== null && (
          <div className="rounded-xl border border-border/35 bg-wheat-50/70 px-3 py-2.5 dark:bg-wheat-800/50">
            <p className="tabular-nums text-base font-bold text-foreground">
              {(wasde.ending_stocks_kt / 1000).toFixed(1)}M {wasde.unit.replace("kt", "MT")}
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              Ending stocks
            </p>
          </div>
        )}
        {wasde.stocks_to_use_pct !== null && (
          <div className="rounded-xl border border-border/35 bg-wheat-50/70 px-3 py-2.5 dark:bg-wheat-800/50">
            <p className="tabular-nums text-base font-bold text-foreground">
              {wasde.stocks_to_use_pct.toFixed(1)}%
              {dirArrow && (
                <span className={cn("ml-1 text-sm", dirColor)}>{dirArrow}</span>
              )}
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              Stocks-to-use
            </p>
          </div>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground/70">
        US {titleCase(commodity)} world balance sheet (USDA WASDE)
      </p>
    </div>
  );
}
