"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { fmtKt } from "@/lib/utils/format";

interface SupplySankeyProps {
  carry_in_kt: number;
  production_kt: number;
  total_supply_kt: number;
  exports_kt?: number;
  food_industrial_kt?: number;
  feed_waste_kt?: number;
  carry_out_kt?: number;
  grain: string;
}

/* ── Layout constants ─────────────────────────────────── */
const VB_W = 600;
const VB_H = 300;

const LEFT_X = 0;
const LEFT_W = 90;
const CENTER_X = 250;
const CENTER_W = 100;
const RIGHT_X = 450;
const RIGHT_W = 90;

const NODE_PADDING = 8; // vertical gap between stacked nodes
const MIN_NODE_H = 18; // minimum node height so small values remain visible

/* ── Color map ────────────────────────────────────────── */
const COLORS = {
  carry_in: "var(--color-prairie)",
  production: "var(--color-prairie-light)",
  exports: "var(--color-error)",
  food_industrial: "var(--color-canola)",
  feed_waste: "var(--color-feed-waste)",
  carry_out: "var(--color-province-ab)",
  total_supply: "var(--color-canola)",
} as const;

/* ── Node type ────────────────────────────────────────── */
interface SankeyNode {
  key: string;
  label: string;
  kt: number;
  color: string;
  x: number;
  w: number;
  y: number;
  h: number;
}

/* ── Helpers ──────────────────────────────────────────── */

/** Distribute nodes vertically within a given available height, sized
 *  proportionally to their kt values, with padding between them. */
function layoutColumn(
  nodes: { key: string; label: string; kt: number; color: string }[],
  x: number,
  w: number,
  availableH: number,
): SankeyNode[] {
  const totalKt = nodes.reduce((sum, n) => sum + n.kt, 0);
  if (totalKt === 0) return [];

  const totalPadding = NODE_PADDING * (nodes.length - 1);
  const usableH = availableH - totalPadding;

  // First pass: proportional heights (clamped to minimum)
  const rawHeights = nodes.map((n) =>
    Math.max((n.kt / totalKt) * usableH, MIN_NODE_H),
  );
  const rawTotal = rawHeights.reduce((a, b) => a + b, 0);
  // Scale so they still fit
  const scale = usableH / rawTotal;
  const heights = rawHeights.map((h) => h * scale);

  const totalUsed = heights.reduce((a, b) => a + b, 0) + totalPadding;
  let y = (availableH - totalUsed) / 2; // center vertically

  return nodes.map((n, i) => {
    const node: SankeyNode = { ...n, x, w, y, h: heights[i] };
    y += heights[i] + NODE_PADDING;
    return node;
  });
}

/** Build a cubic bezier path from the right edge of `from` to the left edge
 *  of `to`, spanning a vertical band [fromY..fromY+bandH] on the source side
 *  and [toY..toY+bandH] on the destination side. */
function flowPath(
  fromRightX: number,
  fromTopY: number,
  fromBotY: number,
  toLeftX: number,
  toTopY: number,
  toBotY: number,
): string {
  const cpx1 = fromRightX + (toLeftX - fromRightX) * 0.45;
  const cpx2 = toLeftX - (toLeftX - fromRightX) * 0.45;

  // Top edge of the flow ribbon
  const top = `M ${fromRightX},${fromTopY} C ${cpx1},${fromTopY} ${cpx2},${toTopY} ${toLeftX},${toTopY}`;
  // Right edge (down the destination)
  const right = `L ${toLeftX},${toBotY}`;
  // Bottom edge (reversed)
  const bot = `C ${cpx2},${toBotY} ${cpx1},${fromBotY} ${fromRightX},${fromBotY}`;
  // Close
  return `${top} ${right} ${bot} Z`;
}

/* ── Component ────────────────────────────────────────── */

export function SupplySankey({
  carry_in_kt,
  production_kt,
  total_supply_kt,
  exports_kt,
  food_industrial_kt,
  feed_waste_kt,
  carry_out_kt,
  grain,
}: SupplySankeyProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inView = useInView(containerRef, { once: true });

  /* ── Build node data ──────────────────────────────── */
  const leftDefs = [
    { key: "carry_in", label: "Carry-in", kt: carry_in_kt, color: COLORS.carry_in },
    { key: "production", label: "Production", kt: production_kt, color: COLORS.production },
  ];

  const rightDefs = [
    exports_kt != null && { key: "exports", label: "Exports", kt: exports_kt, color: COLORS.exports },
    food_industrial_kt != null && { key: "food_industrial", label: "Food / Ind.", kt: food_industrial_kt, color: COLORS.food_industrial },
    feed_waste_kt != null && { key: "feed_waste", label: "Feed / Waste", kt: feed_waste_kt, color: COLORS.feed_waste },
    carry_out_kt != null && { key: "carry_out", label: "Carry-out", kt: carry_out_kt, color: COLORS.carry_out },
  ].filter(Boolean) as { key: string; label: string; kt: number; color: string }[];

  /* ── Layout ───────────────────────────────────────── */
  const leftNodes = layoutColumn(leftDefs, LEFT_X, LEFT_W, VB_H);
  const rightNodes = layoutColumn(rightDefs, RIGHT_X, RIGHT_W, VB_H);

  // Center "Total Supply" is a single node filling the combined height
  const centerTop = Math.min(
    leftNodes.length > 0 ? leftNodes[0].y : VB_H * 0.25,
    rightNodes.length > 0 ? rightNodes[0].y : VB_H * 0.25,
  );
  const centerBot = Math.max(
    leftNodes.length > 0 ? leftNodes[leftNodes.length - 1].y + leftNodes[leftNodes.length - 1].h : VB_H * 0.75,
    rightNodes.length > 0 ? rightNodes[rightNodes.length - 1].y + rightNodes[rightNodes.length - 1].h : VB_H * 0.75,
  );
  const centerNode: SankeyNode = {
    key: "total_supply",
    label: "Total Supply",
    kt: total_supply_kt,
    color: COLORS.total_supply,
    x: CENTER_X,
    w: CENTER_W,
    y: centerTop,
    h: centerBot - centerTop,
  };

  /* ── Build flow paths (left -> center) ────────────── */
  // Partition the center node's left edge proportionally among source nodes
  const leftTotal = leftNodes.reduce((s, n) => s + n.kt, 0);
  const leftFlows: { d: string; color: string; key: string }[] = [];
  let cLeftY = centerNode.y;

  for (const ln of leftNodes) {
    const bandH = leftTotal > 0 ? (ln.kt / leftTotal) * centerNode.h : centerNode.h / leftNodes.length;
    leftFlows.push({
      key: `flow-l-${ln.key}`,
      color: ln.color,
      d: flowPath(
        ln.x + ln.w,
        ln.y,
        ln.y + ln.h,
        centerNode.x,
        cLeftY,
        cLeftY + bandH,
      ),
    });
    cLeftY += bandH;
  }

  /* ── Build flow paths (center -> right) ───────────── */
  const rightTotal = rightNodes.reduce((s, n) => s + n.kt, 0);
  const rightFlows: { d: string; color: string; key: string }[] = [];
  let cRightY = centerNode.y;

  for (const rn of rightNodes) {
    const bandH = rightTotal > 0 ? (rn.kt / rightTotal) * centerNode.h : centerNode.h / rightNodes.length;
    rightFlows.push({
      key: `flow-r-${rn.key}`,
      color: rn.color,
      d: flowPath(
        centerNode.x + centerNode.w,
        cRightY,
        cRightY + bandH,
        rn.x,
        rn.y,
        rn.y + rn.h,
      ),
    });
    cRightY += bandH;
  }

  const allFlows = [...leftFlows, ...rightFlows];

  /* ── Render ───────────────────────────────────────── */
  return (
    <div ref={containerRef} className="w-full">
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="w-full h-auto"
        role="img"
        aria-label={`${grain} supply flow diagram showing ${fmtKt(total_supply_kt)} total supply`}
      >
        {/* Flow ribbons */}
        {allFlows.map((flow, i) => (
          <motion.path
            key={flow.key}
            d={flow.d}
            fill={flow.color}
            fillOpacity={0.35}
            stroke={flow.color}
            strokeWidth={0.5}
            strokeOpacity={0.6}
            initial={{ pathLength: 0, fillOpacity: 0 }}
            animate={
              inView
                ? { pathLength: 1, fillOpacity: 0.35 }
                : { pathLength: 0, fillOpacity: 0 }
            }
            transition={{
              pathLength: {
                duration: 0.8,
                delay: i * 0.15,
                ease: [0.16, 1, 0.3, 1],
              },
              fillOpacity: {
                duration: 0.4,
                delay: i * 0.15 + 0.4,
                ease: "easeOut",
              },
            }}
          />
        ))}

        {/* Left nodes */}
        {leftNodes.map((node, i) => (
          <motion.g
            key={node.key}
            initial={{ opacity: 0, x: -12 }}
            animate={inView ? { opacity: 1, x: 0 } : { opacity: 0, x: -12 }}
            transition={{ duration: 0.5, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
          >
            <rect
              x={node.x}
              y={node.y}
              width={node.w}
              height={node.h}
              rx={4}
              fill={node.color}
              fillOpacity={0.85}
            />
            <text
              x={node.x + node.w / 2}
              y={node.y + node.h / 2 - 5}
              textAnchor="middle"
              className="fill-foreground text-[9px] font-semibold"
            >
              {node.label}
            </text>
            <text
              x={node.x + node.w / 2}
              y={node.y + node.h / 2 + 7}
              textAnchor="middle"
              className="fill-muted-foreground text-[7px]"
            >
              {fmtKt(node.kt)}
            </text>
          </motion.g>
        ))}

        {/* Center node */}
        <motion.g
          initial={{ opacity: 0, scaleY: 0.6 }}
          animate={inView ? { opacity: 1, scaleY: 1 } : { opacity: 0, scaleY: 0.6 }}
          transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          style={{ transformOrigin: `${centerNode.x + centerNode.w / 2}px ${centerNode.y + centerNode.h / 2}px` }}
        >
          <rect
            x={centerNode.x}
            y={centerNode.y}
            width={centerNode.w}
            height={centerNode.h}
            rx={6}
            fill={centerNode.color}
            fillOpacity={0.2}
            stroke={centerNode.color}
            strokeWidth={1.5}
            strokeOpacity={0.6}
          />
          <text
            x={centerNode.x + centerNode.w / 2}
            y={centerNode.y + centerNode.h / 2 - 10}
            textAnchor="middle"
            className="fill-foreground text-[10px] font-bold"
          >
            Total Supply
          </text>
          <text
            x={centerNode.x + centerNode.w / 2}
            y={centerNode.y + centerNode.h / 2 + 5}
            textAnchor="middle"
            className="fill-canola text-[12px] font-bold font-display"
          >
            {fmtKt(total_supply_kt, 0)}
          </text>
          <text
            x={centerNode.x + centerNode.w / 2}
            y={centerNode.y + centerNode.h / 2 + 18}
            textAnchor="middle"
            className="fill-muted-foreground text-[7px]"
          >
            {grain}
          </text>
        </motion.g>

        {/* Right nodes */}
        {rightNodes.map((node, i) => (
          <motion.g
            key={node.key}
            initial={{ opacity: 0, x: 12 }}
            animate={inView ? { opacity: 1, x: 0 } : { opacity: 0, x: 12 }}
            transition={{
              duration: 0.5,
              delay: 0.3 + i * 0.1,
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            <rect
              x={node.x}
              y={node.y}
              width={node.w}
              height={node.h}
              rx={4}
              fill={node.color}
              fillOpacity={0.85}
            />
            <text
              x={node.x + node.w / 2}
              y={node.y + node.h / 2 - 5}
              textAnchor="middle"
              className="fill-foreground text-[9px] font-semibold"
            >
              {node.label}
            </text>
            <text
              x={node.x + node.w / 2}
              y={node.y + node.h / 2 + 7}
              textAnchor="middle"
              className="fill-muted-foreground text-[7px]"
            >
              {fmtKt(node.kt)}
            </text>
          </motion.g>
        ))}
      </svg>
    </div>
  );
}
