"use client"

import type { ReactNode } from "react"
import {
  BarChart,
  Bar,
  LabelList,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
} from "recharts"
import { GlassTooltip } from "@/components/ui/glass-tooltip"
import { fmtKt } from "@/lib/utils/format"
import type { GrainDeliveryBinRow } from "@/lib/queries/overview-data"

const CANOLA = "#c17f24"
const PRAIRIE = "#437a22"
const INK = "#2a261e"
const INK_MUTED = "#7c6c43"
const WHEAT_50 = "#f5f3ee"
const WHEAT_100 = "#ebe7dc"
const WHEAT_200 = "#d7cfba"

interface GrainDeliveriesBinsProps {
  rows: GrainDeliveryBinRow[]
  grainWeek: number
}

function formatAxis(value: number): string {
  return fmtKt(value, 0).replace(" kt", "")
}

function formatCompactKt(value: number): string {
  const absValue = Math.abs(value)
  if (absValue >= 1000) {
    const mt = value / 1000
    return `${mt >= 10 ? mt.toFixed(1) : mt.toFixed(2)} Mt`
  }
  if (absValue >= 100) return `${value.toFixed(0)} kt`
  if (absValue >= 10) return `${value.toFixed(1)} kt`
  if (absValue > 0) return `${value.toFixed(2)} kt`
  return "0 kt"
}

function formatKtBarLabel(value: unknown): string {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return ""
  return formatCompactKt(numeric)
}

function formatPercentLabel(value: unknown): string {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? `${numeric.toFixed(0)}% left` : ""
}

function markerLeftPct(startingWidthPct: number, remainingPct: number): number {
  return (startingWidthPct * Math.max(0, Math.min(100, remainingPct))) / 100
}

function SupplyLegend() {
  const swatches = [
    { label: "In farmer storage", color: PRAIRIE },
    { label: "Delivered from starting supply", color: WHEAT_100 },
  ]
  const markers = [{ label: "Last year", color: CANOLA }]

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "10px 16px",
        marginBottom: 10,
        fontFamily: "var(--font-dm-sans)",
        fontSize: 11,
        color: INK_MUTED,
      }}
    >
      {swatches.map((item) => (
        <span
          key={item.label}
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <span
            style={{
              width: 18,
              height: 8,
              borderRadius: 999,
              background: item.color,
              border: item.color === WHEAT_100 ? `1px solid ${WHEAT_200}` : "none",
            }}
          />
          {item.label}
        </span>
      ))}
      {markers.map((item) => (
        <span
          key={item.label}
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <span
            style={{
              width: 18,
              height: 12,
              borderLeft: `2px dashed ${item.color}`,
            }}
          />
          {item.label}
        </span>
      ))}
    </div>
  )
}

function buildSupplyTooltip(row: GrainDeliveryBinRow): string {
  const lines = [
    row.grain,
    `Starting supply: ${fmtKt(row.startingSupplyKt)}`,
    `Production: ${fmtKt(row.productionKt)}`,
    `Carry-in: ${fmtKt(row.carryInKt)}`,
    `CGC crop-year deliveries: ${fmtKt(row.cropYearDeliveriesKt)}`,
    `AAFC feed/waste: ${fmtKt(row.feedWasteKt)}`,
    `AAFC total domestic: ${fmtKt(row.totalDomesticKt)}`,
    `Estimated in farmer storage: ${fmtKt(row.remainingInBinKt)}`,
    `Remaining share: ${row.remainingPct.toFixed(1)}%`,
  ]

  if (row.lastYear) {
    lines.push(
      `Last year same week: ${row.lastYear.remainingPct.toFixed(1)}% (${fmtKt(
        row.lastYear.remainingInBinKt
      )})`
    )
  }

  return lines.join("\n")
}

function FarmBinSupplyChart({ rows }: { rows: GrainDeliveryBinRow[] }) {
  const maxStartingSupplyKt = Math.max(
    ...rows.map((row) => row.startingSupplyKt),
    1
  )
  const axisTicks = Array.from(
    { length: 5 },
    (_, index) => (maxStartingSupplyKt / 4) * index
  )

  return (
    <div
      style={{
        marginTop: 4,
        fontFamily: "var(--font-dm-sans)",
      }}
    >
      <div style={{ display: "grid", gap: 8 }}>
        {rows.map((row) => {
          const startingWidthPct = (row.startingSupplyKt / maxStartingSupplyKt) * 100
          const remainingWidthPct =
            row.startingSupplyKt > 0
              ? (row.remainingInBinKt / row.startingSupplyKt) * 100
              : 0

          return (
            <div
              key={row.slug}
              style={{
                display: "grid",
                gridTemplateColumns: "120px minmax(0, 1fr)",
                gap: 10,
                alignItems: "center",
                minHeight: 18,
              }}
            >
              <div
                style={{
                  color: "#5d5132",
                  fontSize: 11,
                  lineHeight: 1.2,
                  textAlign: "right",
                  whiteSpace: "nowrap",
                }}
              >
                {row.grain}
              </div>
              <div
                className="group"
                title={buildSupplyTooltip(row)}
                aria-label={buildSupplyTooltip(row)}
                style={{
                  position: "relative",
                  height: 18,
                  marginRight: 132,
                }}
              >
                {axisTicks.slice(1).map((tick) => (
                  <span
                    key={tick}
                    aria-hidden
                    style={{
                      position: "absolute",
                      left: `${(tick / maxStartingSupplyKt) * 100}%`,
                      top: -5,
                      bottom: -5,
                      width: 1,
                      background: WHEAT_50,
                    }}
                  />
                ))}
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 3,
                    width: `${startingWidthPct}%`,
                    height: 12,
                    background: WHEAT_100,
                    border: `1px solid ${WHEAT_200}`,
                    borderRadius: 999,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${remainingWidthPct}%`,
                      height: "100%",
                      background: PRAIRIE,
                      borderRadius: 999,
                    }}
                  />
                </div>
                {row.lastYear && (
                  <span
                    aria-hidden
                    title={`Last year: ${row.lastYear.remainingPct.toFixed(1)}% left`}
                    style={{
                      position: "absolute",
                      left: `${markerLeftPct(startingWidthPct, row.lastYear.remainingPct)}%`,
                      top: 0,
                      height: 18,
                      borderLeft: `2px dashed ${CANOLA}`,
                      zIndex: 3,
                    }}
                  />
                )}
                <span
                  style={{
                    position: "absolute",
                    left: `calc(${startingWidthPct}% + 7px)`,
                    top: 2,
                    color: INK_MUTED,
                    fontSize: 11,
                    fontWeight: 700,
                    lineHeight: "14px",
                    whiteSpace: "nowrap",
                  }}
                >
                  {formatPercentLabel(row.remainingPct)}
                  {" - "}
                  {formatCompactKt(row.remainingInBinKt)}
                </span>
                <div
                  className="pointer-events-none absolute left-2 top-6 z-20 w-64 opacity-0 transition-opacity group-hover:opacity-100"
                  style={{
                    background: "rgba(255,255,255,0.96)",
                    border: `1px solid ${WHEAT_200}`,
                    boxShadow:
                      "0 8px 32px rgba(42,38,30,0.08), 0 2px 8px rgba(42,38,30,0.04)",
                    padding: "10px 12px",
                    color: INK,
                    fontSize: 11,
                    lineHeight: 1.45,
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>{row.grain}</div>
                  <div>Starting supply: {fmtKt(row.startingSupplyKt)}</div>
                  <div>Production: {fmtKt(row.productionKt)}</div>
                  <div>Carry-in: {fmtKt(row.carryInKt)}</div>
                  <div>CGC CYTD deliveries: {fmtKt(row.cropYearDeliveriesKt)}</div>
                  <div>AAFC feed/waste: {fmtKt(row.feedWasteKt)}</div>
                  <div>AAFC total domestic: {fmtKt(row.totalDomesticKt)}</div>
                  <div>Estimated in storage: {fmtKt(row.remainingInBinKt)}</div>
                  <div>Remaining share: {row.remainingPct.toFixed(1)}%</div>
                  {row.lastYear && (
                    <div>
                      Last year: {row.lastYear.remainingPct.toFixed(1)}% /{" "}
                      {fmtKt(row.lastYear.remainingInBinKt)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "120px minmax(0, 1fr)",
          gap: 10,
          marginTop: 10,
        }}
      >
        <div />
        <div style={{ position: "relative", height: 18, marginRight: 132 }}>
          {axisTicks.map((tick, index) => (
            <span
              key={tick}
              className={
                index > 0 && index < axisTicks.length - 1 ? "hidden sm:inline" : undefined
              }
              style={{
                position: "absolute",
                left: `${(tick / maxStartingSupplyKt) * 100}%`,
                transform: tick === 0 ? "none" : "translateX(-50%)",
                color: "#6f6244",
                fontSize: 11,
                lineHeight: "18px",
                whiteSpace: "nowrap",
              }}
            >
              {formatAxis(tick)}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function ChartFrame({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${WHEAT_200}`,
        padding: "22px 22px 18px",
        minWidth: 0,
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <div
          style={{
            fontFamily: "var(--font-dm-sans)",
            fontSize: 11,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: INK_MUTED,
            fontWeight: 600,
            marginBottom: 6,
          }}
        >
          {eyebrow}
        </div>
        <h3
          style={{
            fontFamily: "var(--font-fraunces)",
            fontSize: "clamp(18px, 1.8vw, 24px)",
            fontWeight: 400,
            color: INK,
            margin: 0,
            letterSpacing: "-0.015em",
          }}
        >
          {title}
        </h3>
        <p
          style={{
            fontFamily: "var(--font-dm-sans)",
            fontSize: 13,
            lineHeight: 1.5,
            color: "#5d5132",
            margin: "6px 0 0",
            maxWidth: 720,
          }}
        >
          {subtitle}
        </p>
      </div>

      {children}
    </div>
  )
}

export function GrainDeliveriesBins({
  rows,
  grainWeek,
}: GrainDeliveriesBinsProps) {
  if (!rows.length) return null

  return (
    <div className="grid min-w-0 gap-6">
      <ChartFrame
        eyebrow={`AAFC 2025-2026 starting supply - CGC week ${grainWeek}`}
        title="Estimated Grain in Farmer Storage"
        subtitle="Full bar = AAFC production + carry-in. Green is the estimated share still in farmer storage after CGC crop-year producer deliveries; the dashed marker compares the same grain week last year."
      >
        <SupplyLegend />
        <FarmBinSupplyChart rows={rows} />
        <p
          style={{
            marginTop: 10,
            fontFamily: "var(--font-dm-sans)",
            fontSize: 11,
            color: INK_MUTED,
            letterSpacing: "0.04em",
          }}
        >
          Imports are excluded. CGC deliveries are the sell-down proxy, not a complete domestic disappearance
          model. Corn/feed grains can screen high because on-farm feed and some domestic use are not fully
          captured by weekly CGC producer deliveries.
        </p>
      </ChartFrame>

      <ChartFrame
        eyebrow={`CGC week ${grainWeek}`}
        title="This Week's Producer Deliveries"
        subtitle="Current-week producer deliveries for all 16 grains, aggregated directly from the latest CGC observations."
      >
        <div style={{ width: "100%", minWidth: 0, height: 430 }}>
          <ResponsiveContainer
            width="100%"
            height="100%"
            minWidth={320}
            minHeight={430}
            initialDimension={{ width: 960, height: 430 }}
          >
            <BarChart
              data={rows}
              layout="vertical"
              margin={{ top: 4, right: 78, left: 0, bottom: 4 }}
              barCategoryGap={8}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={WHEAT_100}
                vertical={false}
              />
              <XAxis
                type="number"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={formatAxis}
                className="text-muted-foreground"
              />
              <YAxis
                type="category"
                dataKey="grain"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={110}
                className="text-muted-foreground"
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  const row = payload[0]?.payload as GrainDeliveryBinRow | undefined
                  if (!row) return null

                  return (
                    <GlassTooltip
                      active
                      label={String(label ?? row.grain)}
                      payload={[
                        {
                          name: "This week",
                          value: fmtKt(row.currentWeekDeliveriesKt),
                          color: CANOLA,
                        },
                        {
                          name: "CYTD deliveries",
                          value: fmtKt(row.cropYearDeliveriesKt),
                          color: INK_MUTED,
                        },
                        {
                          name: "Starting supply",
                          value: fmtKt(row.startingSupplyKt),
                          color: INK,
                        },
                      ]}
                    />
                  )
                }}
              />
              <Bar
                dataKey="currentWeekDeliveriesKt"
                name="This week"
                fill={CANOLA}
                radius={[0, 8, 8, 0]}
                barSize={14}
              >
                <LabelList
                  dataKey="currentWeekDeliveriesKt"
                  position="right"
                  formatter={formatKtBarLabel}
                  style={{
                    fill: INK_MUTED,
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p
          style={{
            marginTop: 10,
            fontFamily: "var(--font-dm-sans)",
            fontSize: 11,
            color: INK_MUTED,
            letterSpacing: "0.04em",
          }}
        >
          Horizontal bars make the long grain names readable without hiding the size of the week.
        </p>
      </ChartFrame>
    </div>
  )
}
