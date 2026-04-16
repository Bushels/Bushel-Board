"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Brain, ChevronDown, Minus, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { GrainStanceData } from "./market-stance-chart";

interface UnifiedMarketStanceChartProps {
  caRows: GrainStanceData[];
  caGrainWeek: number;
  usRows: GrainStanceData[];
  usMarketYear: number;
  updatedAt?: string | null;
}

function getStanceColor(score: number) {
  if (score >= 20) return "text-prairie";
  if (score > -20) return "text-muted-foreground";
  return "text-amber-600";
}

function ConfidenceDot({ level }: { level: "high" | "medium" | "low" }) {
  const colors = { high: "bg-prairie", medium: "bg-canola", low: "bg-muted-foreground/40" };
  return <span className={cn("inline-block h-1.5 w-1.5 rounded-full", colors[level])} title={`${level} confidence`} />;
}

function getDeltaIcon(delta: number) {
  if (delta > 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-prairie">
        <TrendingUp className="h-3 w-3" />
        <span className="text-[11px] font-semibold tabular-nums">+{delta}</span>
      </span>
    );
  if (delta < 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-amber-600">
        <TrendingDown className="h-3 w-3" />
        <span className="text-[11px] font-semibold tabular-nums">{delta}</span>
      </span>
    );
  return (
    <span className="inline-flex items-center gap-0.5 text-muted-foreground">
      <Minus className="h-3 w-3" />
      <span className="text-[11px] font-semibold tabular-nums">0</span>
    </span>
  );
}

function BulletColumn({
  title,
  points,
  tone,
  emptyLabel,
  emptyHint,
}: {
  title: string;
  points: { fact: string; reasoning: string }[];
  tone: "bull" | "bear";
  emptyLabel: string;
  emptyHint?: string | null;
}) {
  const isBull = tone === "bull";
  const cardClass = isBull
    ? "rounded-lg border border-prairie/25 bg-prairie/5 p-3 sm:p-4"
    : "rounded-lg border border-amber-600/25 bg-amber-600/5 p-3 sm:p-4";
  const toneClass = isBull ? "text-prairie" : "text-amber-600";
  const Icon = isBull ? TrendingUp : TrendingDown;

  return (
    <div className={cardClass}>
      <div className="mb-2.5 flex items-center gap-1.5">
        <Icon className={cn("h-4 w-4", toneClass)} />
        <p className={cn("text-xs font-semibold uppercase tracking-wider", toneClass)}>{title}</p>
      </div>
      {points.length === 0 ? (
        <div className="space-y-1">
          <p className="text-xs italic text-muted-foreground/70">{emptyLabel}</p>
          {emptyHint && (
            <p className="text-[11px] leading-snug text-muted-foreground/60">{emptyHint}</p>
          )}
        </div>
      ) : (
        <ul className="space-y-0">
          {points.map((p, i) => (
            <li
              key={i}
              className={cn(
                "space-y-0.5 py-2",
                i > 0 && "border-t border-border/40",
                i === 0 && "pt-0",
                i === points.length - 1 && "pb-0",
              )}
            >
              <p className="text-sm font-medium leading-snug">{p.fact}</p>
              <p className="text-xs leading-snug text-muted-foreground">{p.reasoning}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StanceRow({
  row,
  isOpen,
  onToggle,
}: {
  row: GrainStanceData;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const delta = row.priorScore !== null ? row.score - row.priorScore : 0;
  const absScore = Math.abs(row.score);
  const isBullish = row.score > 0;
  const isBearish = row.score < 0;
  const rowKey = `${row.region}:${row.slug}`;

  // Delta-aware empty-state messaging. When our AI swarm drops the stance
  // meaningfully but omits structured bear_reasoning (a known pipeline gap),
  // say so honestly instead of displaying a flat "no bear case" message.
  const bearEmpty =
    row.bearPoints.length === 0
      ? delta <= -10
        ? {
            label: `Stance softened ${delta} WoW, but no specific bearish drivers were captured this week.`,
            hint: "Check the deliveries, basis, or terminal cards on the grain page — a soft signal is there even if the AI didn't name it.",
          }
        : delta < 0
          ? {
              label: "No standalone bear case this week — stance is slightly softer but drivers remain mostly bullish.",
              hint: null,
            }
          : { label: "No bear case recorded this week.", hint: null }
      : null;
  const bullEmpty =
    row.bullPoints.length === 0
      ? delta >= 10
        ? {
            label: `Stance firmed +${delta} WoW, but no specific bullish drivers were captured this week.`,
            hint: "Check the deliveries, basis, or terminal cards on the grain page — a supportive signal is there even if the AI didn't name it.",
          }
        : { label: "No bull case recorded this week.", hint: null }
      : null;
  const panelId = `stance-panel-${rowKey}`;
  const buttonId = `stance-button-${rowKey}`;

  return (
    <div>
      <button
        id={buttonId}
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={onToggle}
        className="grid w-full items-center gap-2 rounded-sm py-1.5 text-left -mx-1 px-1 hover:bg-muted/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-canola grid-cols-[84px_32px_1fr_44px_16px] sm:grid-cols-[100px_28px_1fr_56px_52px_16px]"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <ConfidenceDot level={row.confidence} />
          <span className="text-sm font-medium truncate">{row.grain}</span>
        </div>
        <span className={cn("text-xs font-bold tabular-nums text-right", getStanceColor(row.score))}>
          {row.score > 0 ? "+" : ""}
          {row.score}
        </span>
        <div className="relative flex h-5 items-center rounded-sm bg-muted/20 overflow-hidden">
          <div className="absolute left-1/2 top-0 z-10 h-full w-px -translate-x-1/2 bg-border/60" />
          <div className="flex h-full w-1/2 justify-end">
            {isBearish && (
              <div
                className="h-full rounded-l-sm bg-amber-600/75"
                style={{ width: `${absScore}%` }}
              />
            )}
          </div>
          <div className="flex h-full w-1/2 justify-start">
            {isBullish && (
              <div
                className="h-full rounded-r-sm bg-prairie/85"
                style={{ width: `${absScore}%` }}
              />
            )}
          </div>
          {row.priorScore !== null && row.priorScore !== row.score && (
            <div
              className="absolute top-0 z-20 h-full w-0.5 bg-foreground/25 rounded-full"
              style={{ left: `${50 + row.priorScore / 2}%` }}
              title={`Prior: ${row.priorScore > 0 ? "+" : ""}${row.priorScore}`}
            />
          )}
        </div>
        <div className="hidden text-right min-w-0 sm:block">
          {row.cashPrice ? (
            <span className="text-[11px] text-muted-foreground tabular-nums truncate">{row.cashPrice}</span>
          ) : (
            <span className="text-[11px] text-muted-foreground/40">—</span>
          )}
        </div>
        <div className="flex justify-end">{getDeltaIcon(delta)}</div>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground/60 transition-transform",
            isOpen && "rotate-180",
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            id={panelId}
            role="region"
            aria-labelledby={buttonId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] as const }}
            className="overflow-hidden"
          >
            <div className="space-y-3 px-0 pt-3 pb-4 sm:px-1">
              <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
                <BulletColumn
                  title="Bull case"
                  points={row.bullPoints}
                  tone="bull"
                  emptyLabel={bullEmpty?.label ?? "No bull case recorded this week."}
                  emptyHint={bullEmpty?.hint ?? null}
                />
                <BulletColumn
                  title="Bear case"
                  points={row.bearPoints}
                  tone="bear"
                  emptyLabel={bearEmpty?.label ?? "No bear case recorded this week."}
                  emptyHint={bearEmpty?.hint ?? null}
                />
              </div>
              {row.thesisSummary && (
                <p className="text-sm leading-6 text-muted-foreground">{row.thesisSummary}</p>
              )}
              {row.recommendation && (
                <p className="text-xs">
                  <span className="font-semibold uppercase tracking-wider text-muted-foreground">Call: </span>
                  <span className="font-medium">{row.recommendation.replace(/_/g, " ")}</span>
                </p>
              )}
              <Link
                href={row.detailHref}
                className="inline-flex text-xs font-medium text-canola hover:underline"
              >
                Open {row.region === "US" ? "full US thesis" : "grain page"} →
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function UnifiedMarketStanceChart({
  caRows,
  caGrainWeek,
  usRows,
  usMarketYear,
  updatedAt,
}: UnifiedMarketStanceChartProps) {
  const prefersReducedMotion = useReducedMotion();
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  // Rows preserve upstream insertion order (popularity in the CA query,
  // CBOT importance in the US markets constant) — we intentionally do NOT
  // re-sort by stance score here.

  const renderGroup = (label: string, explainer: string, rows: GrainStanceData[]) => {
    if (rows.length === 0) return null;
    return (
      <div>
        <div className="flex items-baseline gap-2 pt-3 pb-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
          <span className="text-[10px] text-muted-foreground/60">·</span>
          <span className="text-[11px] text-muted-foreground/70 leading-tight">{explainer}</span>
        </div>
        <div className="space-y-0.5">
          {rows.map((row, i) => {
            const key = `${row.region}:${row.slug}`;
            const content = (
              <StanceRow
                row={row}
                isOpen={expandedKey === key}
                onToggle={() => setExpandedKey((prev) => (prev === key ? null : key))}
              />
            );
            if (prefersReducedMotion) return <div key={key}>{content}</div>;
            return (
              <motion.div
                key={key}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 30, delay: i * 0.04 }}
              >
                {content}
              </motion.div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-canola" />
          <span className="text-xs font-medium text-muted-foreground">AI Stance · Week {caGrainWeek}</span>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-4 rounded-sm bg-amber-600/80" />
            Bearish
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-4 rounded-sm bg-prairie" />
            Bullish
          </span>
        </div>
      </div>

      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
        <Brain className="h-3 w-3" />
        Analyzed by 16 Agriculture Trained AI Agents
      </p>
      <p className="text-[11px] text-muted-foreground/60 leading-snug">
        CA and US stances can differ for the same grain — they're scored from different
        data (CGC vs USDA) and serve different markets (prairie cash vs CBOT futures).
      </p>

      {renderGroup(
        `🇨🇦 Canadian grains · Wk ${caGrainWeek}`,
        "CGC deliveries, terminals, basis & farmer sentiment",
        caRows,
      )}
      {renderGroup(
        `🇺🇸 US markets · MY ${usMarketYear}`,
        "USDA export sales, WASDE S&D, CBOT futures & COT",
        usRows,
      )}

      {updatedAt && (
        <p className="text-[10px] text-muted-foreground/60 text-right">
          Updated{" "}
          {new Date(updatedAt).toLocaleDateString("en-CA", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      )}
    </div>
  );
}
