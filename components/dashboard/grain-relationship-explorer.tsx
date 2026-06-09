"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  EXTERNAL_SCOPE_RANK_MULTIPLIER,
  PUBLIC_SCOPE_RANK_MULTIPLIER,
  sourceAuthorityWeight,
  type GrainImpactGraphBoardRead,
  type GrainImpactGraphScoreRole,
  type GrainRelationshipOverviewEdge,
  type GrainRelationshipOverviewModel,
  type GrainRelationshipOverviewNode,
} from "@/lib/thesis/grain-impact-graph";
import { cn } from "@/lib/utils";

const FOCUS_WIDTH = 980;
const FOCUS_HEIGHT = 420;
const FOCUS_NODE_WIDTH = 172;
const FOCUS_NODE_HEIGHT = 54;
const INFLUENCE_BOARD_WIDTH = 980;
const INFLUENCE_BOARD_HEIGHT = 340;
const INFLUENCE_BOARD_MIN_X = 96;
const INFLUENCE_BOARD_MAX_X = 876;
const INFLUENCE_BOARD_CENTER_Y = 164;
const INFLUENCE_BOARD_SCORE_RANGE_Y = 108;

interface FocusedNode {
  node: GrainRelationshipOverviewNode;
  edge: GrainRelationshipOverviewEdge;
  direction: "incoming" | "outgoing";
  x: number;
  y: number;
}

interface InfluenceBoardRow {
  node: GrainRelationshipOverviewNode;
  read?: GrainImpactGraphBoardRead;
  incomingEdges: GrainRelationshipOverviewEdge[];
  outgoingEdges: GrainRelationshipOverviewEdge[];
  inboundRank: number;
  outboundRank: number;
  netRank: number;
}

interface InfluenceBoardPoint {
  row: InfluenceBoardRow;
  x: number;
  y: number;
  radius: number;
}

function scoreRoleLabel(scoreRole: GrainImpactGraphScoreRole): string {
  if (scoreRole === "score_input") return "Scores";
  if (scoreRole === "bounded_context") return "Bounded context";
  if (scoreRole === "watch_only") return "Watch only";
  return "Blocked gap";
}

function formatSignedScore(score: number | null | undefined): string {
  if (score === null || score === undefined) return "No score";
  if (score > 0) return `+${score}`;
  return String(score);
}

function boardReadLabel(read: GrainImpactGraphBoardRead | undefined): string {
  if (!read || read.score === null) return "Current read pending";
  const confidence = read.confidence === null ? "n/a" : `${read.confidence}%`;
  return `${formatSignedScore(read.score)} / ${confidence}`;
}

function boardReadToneClass(read: GrainImpactGraphBoardRead | undefined): string {
  if (!read || read.score === null) return "border-border bg-muted/40 text-muted-foreground";
  if (read.score > 0) return "border-prairie/25 bg-prairie/10 text-prairie";
  if (read.score < 0) return "border-amber-600/25 bg-amber-500/10 text-amber-800 dark:text-amber-300";
  return "border-border bg-background/70 text-muted-foreground";
}

function boardReadSourceLabel(source: GrainImpactGraphBoardRead["scoreSource"]): string {
  if (source === "daily_overlay") return "daily overlay";
  if (source === "mixed") return "mixed source";
  if (source === "weekly_packet") return "weekly packet";
  return "no score";
}

function boardReadByGrain(boardReads: readonly GrainImpactGraphBoardRead[]): Map<string, GrainImpactGraphBoardRead> {
  return new Map(boardReads.map((read) => [read.grain, read]));
}

function scoreRoleClass(scoreRole: GrainImpactGraphScoreRole): string {
  if (scoreRole === "score_input") return "border-prairie/25 bg-prairie/10 text-prairie";
  if (scoreRole === "bounded_context") return "border-canola/35 bg-canola/10 text-canola";
  if (scoreRole === "watch_only") return "border-amber-600/25 bg-amber-500/10 text-amber-800 dark:text-amber-300";
  return "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300";
}

function scoreRoleStroke(scoreRole: GrainImpactGraphScoreRole): string {
  if (scoreRole === "score_input") return "#437a22";
  if (scoreRole === "bounded_context") return "#c17f24";
  if (scoreRole === "watch_only") return "#d97706";
  return "#b33a3a";
}

function scoreRoleFill(scoreRole: GrainImpactGraphScoreRole): string {
  if (scoreRole === "score_input") return "rgba(67, 122, 34, 0.10)";
  if (scoreRole === "bounded_context") return "rgba(193, 127, 36, 0.12)";
  if (scoreRole === "watch_only") return "rgba(217, 119, 6, 0.10)";
  return "rgba(179, 58, 58, 0.10)";
}

function boardReadStroke(read: GrainImpactGraphBoardRead | undefined): string {
  if (!read || read.score === null) return "#7c6c43";
  if (read.score > 0) return "#437a22";
  if (read.score < 0) return "#d97706";
  return "#7c6c43";
}

function relationshipKindLabel(kind: GrainRelationshipOverviewEdge["kind"]): string {
  return kind.replaceAll("_", " ");
}

function sourceClassLabel(sourceClass: GrainRelationshipOverviewEdge["sourceClass"]): string {
  if (sourceClass === "official_thesis_input") return "official input";
  if (sourceClass === "price_context") return "price context";
  if (sourceClass === "watch_only") return "watch only";
  return "parked";
}

function sourceAuthorityProof(sourceClass: GrainRelationshipOverviewEdge["sourceClass"]): string {
  return `authority ${sourceAuthorityWeight(sourceClass).toFixed(2)}`;
}

function publicScopeProof(edge: GrainRelationshipOverviewEdge): string {
  return edge.targetInPublicScope
    ? `public scope ${PUBLIC_SCOPE_RANK_MULTIPLIER}`
    : `external scope ${EXTERNAL_SCOPE_RANK_MULTIPLIER}`;
}

function rankProofLabel(edge: GrainRelationshipOverviewEdge): string {
  return `${sourceAuthorityProof(edge.sourceClass)} x ${publicScopeProof(edge)} = rank ${edge.rank}`;
}

function truncateLabel(value: string, length = 34): string {
  if (value.length <= length) return value;
  return `${value.slice(0, length - 1).trimEnd()}...`;
}

function nodeRows(
  edges: GrainRelationshipOverviewEdge[],
  nodesById: Map<string, GrainRelationshipOverviewNode>,
  direction: "incoming" | "outgoing",
): FocusedNode[] {
  const limited = edges.slice(0, 5);
  const x = direction === "incoming" ? 58 : 750;
  const gap = limited.length <= 1 ? 0 : 268 / (limited.length - 1);
  const startY = limited.length <= 1 ? 182 : 70;

  return limited.flatMap((edge, index) => {
    const node = nodesById.get(direction === "incoming" ? edge.from : edge.to);
    if (!node) return [];
    return [{
      node,
      edge,
      direction,
      x,
      y: startY + index * gap,
    }];
  });
}

function influenceBoardRows({
  overview,
  grainNodes,
  readsByGrain,
}: {
  overview: GrainRelationshipOverviewModel;
  grainNodes: readonly GrainRelationshipOverviewNode[];
  readsByGrain: Map<string, GrainImpactGraphBoardRead>;
}): InfluenceBoardRow[] {
  return grainNodes
    .map((node) => {
      const incomingEdges = overview.edges.filter((edge) => edge.to === node.id);
      const outgoingEdges = overview.edges.filter((edge) => edge.from === node.id);
      const inboundRank = incomingEdges.reduce((sum, edge) => sum + edge.rank, 0);
      const outboundRank = outgoingEdges.reduce((sum, edge) => sum + edge.rank, 0);

      return {
        node,
        read: readsByGrain.get(node.label),
        incomingEdges,
        outgoingEdges,
        inboundRank,
        outboundRank,
        netRank: inboundRank + outboundRank,
      };
    })
    .sort((left, right) => {
      if (left.netRank !== right.netRank) return right.netRank - left.netRank;
      if (left.outboundRank !== right.outboundRank) return right.outboundRank - left.outboundRank;
      return left.node.label.localeCompare(right.node.label);
    });
}

function confidenceWeight(read: GrainImpactGraphBoardRead | undefined): number {
  if (!read || read.confidence === null) return 0;
  return Math.max(0, Math.min(100, read.confidence)) / 100;
}

function influenceBoardPoint(row: InfluenceBoardRow, maxRank: number): InfluenceBoardPoint {
  const rankShare = maxRank <= 0 ? 0 : row.netRank / maxRank;
  const readScore = row.read?.score ?? 0;
  const clippedScore = Math.max(-100, Math.min(100, readScore));
  const targetY = INFLUENCE_BOARD_CENTER_Y - (clippedScore / 100) * INFLUENCE_BOARD_SCORE_RANGE_Y;
  const confidenceAdjustedY =
    INFLUENCE_BOARD_CENTER_Y + (targetY - INFLUENCE_BOARD_CENTER_Y) * confidenceWeight(row.read);

  return {
    row,
    x: INFLUENCE_BOARD_MIN_X + (INFLUENCE_BOARD_MAX_X - INFLUENCE_BOARD_MIN_X) * rankShare,
    y: confidenceAdjustedY,
    radius: 12 + Math.min(16, row.netRank / 14),
  };
}

function influenceBoardPoints(rows: readonly InfluenceBoardRow[], maxRank: number): InfluenceBoardPoint[] {
  const points = rows.map((row) => influenceBoardPoint(row, maxRank));
  const tiedRankGroups = new Map<number, InfluenceBoardPoint[]>();

  for (const point of points) {
    const group = tiedRankGroups.get(point.row.netRank) ?? [];
    group.push(point);
    tiedRankGroups.set(point.row.netRank, group);
  }

  for (const group of tiedRankGroups.values()) {
    if (group.length <= 1) continue;
    group
      .sort((left, right) => left.row.node.label.localeCompare(right.row.node.label))
      .forEach((point, index) => {
        const midpoint = (group.length - 1) / 2;
        const offset = (index - midpoint) * 74;
        point.x = Math.max(INFLUENCE_BOARD_MIN_X, Math.min(INFLUENCE_BOARD_MAX_X, point.x + offset));
      });
  }

  return points;
}

function influenceBoardLabelY(point: InfluenceBoardPoint): number {
  return point.y < INFLUENCE_BOARD_CENTER_Y ? point.y - point.radius - 10 : point.y + point.radius + 18;
}

function grainConversationEdge(
  overview: GrainRelationshipOverviewModel,
  fromNode: GrainRelationshipOverviewNode,
  toNode: GrainRelationshipOverviewNode,
): GrainRelationshipOverviewEdge | undefined {
  return overview.edges.find((edge) => edge.from === fromNode.id && edge.to === toNode.id);
}

function conversationEdgeLabel(edge: GrainRelationshipOverviewEdge | undefined, empty: string): string {
  if (!edge) return empty;
  return `${edge.fromLabel} to ${edge.toLabel} (rank ${edge.rank})`;
}

function SelectedMatrixSummary({
  overview,
  grainNodes,
  selectedGrain,
}: {
  overview: GrainRelationshipOverviewModel;
  grainNodes: readonly GrainRelationshipOverviewNode[];
  selectedGrain: string;
}) {
  const selectedNode = grainNodes.find((node) => node.label === selectedGrain);
  if (!selectedNode) return null;

  const outgoingEdges = overview.edges.filter((edge) => edge.from === selectedNode.id);
  const incomingEdges = overview.edges.filter((edge) => edge.to === selectedNode.id);
  const publicOutgoing = outgoingEdges.filter((edge) => edge.targetInPublicScope);
  const publicIncoming = incomingEdges.filter((edge) => edge.targetInPublicScope);
  const externalAnchors = outgoingEdges.filter((edge) => !edge.targetInPublicScope);
  const strongestOutgoing = strongestEdge(publicOutgoing);
  const strongestIncoming = strongestEdge(publicIncoming);
  const strongestExternal = strongestEdge(externalAnchors);
  const quietGrains = grainNodes
    .filter((node) => node.id !== selectedNode.id)
    .filter((node) => (
      !overview.edges.some((edge) => (
        (edge.from === selectedNode.id && edge.to === node.id)
        || (edge.from === node.id && edge.to === selectedNode.id)
      ))
    ))
    .map((node) => node.label);

  return (
    <div className="grid gap-2 lg:grid-cols-4">
      <div className="rounded-md border border-border bg-card p-3 text-xs leading-5">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Selected grain summary</p>
        <p className="font-semibold text-foreground">{selectedNode.label}</p>
        <p className="mt-1 text-muted-foreground">
          {publicOutgoing.length} public out / {publicIncoming.length} public in / {externalAnchors.length} external
        </p>
      </div>
      <div className="rounded-md border border-border bg-card p-3 text-xs leading-5">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Strongest send</p>
        <p className="font-semibold text-foreground">{conversationEdgeLabel(strongestOutgoing, "No public send")}</p>
      </div>
      <div className="rounded-md border border-border bg-card p-3 text-xs leading-5">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Strongest receive</p>
        <p className="font-semibold text-foreground">{conversationEdgeLabel(strongestIncoming, "No public receive")}</p>
      </div>
      <div className="rounded-md border border-border bg-card p-3 text-xs leading-5">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quiet or external</p>
        <p className="font-semibold text-foreground">
          {strongestExternal ? conversationEdgeLabel(strongestExternal, "") : "No external anchor"}
        </p>
        <p className="mt-1 text-muted-foreground">
          Quiet with {quietGrains.length > 0 ? quietGrains.join(", ") : "none"}
        </p>
      </div>
    </div>
  );
}

function GrainConversationMatrix({
  overview,
  grainNodes,
  selectedGrain,
  onSelectGrain,
}: {
  overview: GrainRelationshipOverviewModel;
  grainNodes: readonly GrainRelationshipOverviewNode[];
  selectedGrain: string;
  onSelectGrain: (grain: string) => void;
}) {
  const grainLinks = overview.edges.filter((edge) => edge.targetInPublicScope);
  const strongestLink = grainLinks[0];

  return (
    <div className="space-y-3 rounded-md border border-border bg-background p-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Grain conversation matrix</p>
          <h4 className="mt-1 font-display text-lg font-semibold">Who talks to whom</h4>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
            Rows push influence. Columns receive it. Each ranked cell is a direct modeled relationship between public
            V1 grains.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="border-border bg-muted/40 text-muted-foreground tabular-nums">
            {grainLinks.length} grain links
          </Badge>
          {strongestLink ? (
            <Badge variant="outline" className={cn("border-canola/35 bg-canola/10 text-canola tabular-nums")}>
              top {strongestLink.fromLabel} to {strongestLink.toLabel} {strongestLink.rank}
            </Badge>
          ) : null}
        </div>
      </div>

      <SelectedMatrixSummary overview={overview} grainNodes={grainNodes} selectedGrain={selectedGrain} />

      <div className="overflow-x-auto">
        <table className="w-full min-w-[780px] border-separate border-spacing-0 text-left text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 border-b border-border bg-background px-2 py-2 font-semibold text-muted-foreground">
                From / to
              </th>
              {grainNodes.map((node) => (
                <th
                  key={`conversation-column-${node.id}`}
                  className={cn(
                    "border-b border-border px-2 py-2 text-center font-semibold",
                    node.label === selectedGrain ? "text-canola" : "text-muted-foreground",
                  )}
                >
                  {node.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grainNodes.map((fromNode) => (
              <tr key={`conversation-row-${fromNode.id}`}>
                <th
                  className={cn(
                    "sticky left-0 z-10 border-b border-border/70 bg-background px-2 py-2 font-semibold",
                    fromNode.label === selectedGrain ? "text-canola" : "text-foreground",
                  )}
                >
                  {fromNode.label}
                </th>
                {grainNodes.map((toNode) => {
                  const edge = fromNode.id === toNode.id
                    ? undefined
                    : grainConversationEdge(overview, fromNode, toNode);
                  const selected = fromNode.label === selectedGrain || toNode.label === selectedGrain;

                  return (
                    <td
                      key={`conversation-cell-${fromNode.id}-${toNode.id}`}
                      className={cn(
                        "border-b border-border/70 px-1.5 py-1.5 text-center align-middle",
                        selected ? "bg-canola/5" : "",
                      )}
                    >
                      {edge ? (
                        <button
                          type="button"
                          aria-label={`Select ${edge.fromLabel} to ${edge.toLabel} relationship`}
                          className={cn(
                            "mx-auto flex min-h-10 w-full min-w-20 flex-col items-center justify-center rounded-md border px-2 py-1 text-[11px] leading-4 transition-colors",
                            edge.fromLabel === selectedGrain
                              ? "border-canola/45 bg-canola/10 text-canola"
                              : "border-border bg-muted/30 text-foreground hover:border-canola/40 hover:bg-canola/5",
                          )}
                          onClick={() => onSelectGrain(edge.fromLabel)}
                        >
                          <span className="font-semibold tabular-nums">rank {edge.rank}</span>
                          <span className="text-[10px] text-muted-foreground">{relationshipKindLabel(edge.kind)}</span>
                        </button>
                      ) : (
                        <span className="mx-auto flex min-h-10 w-full min-w-20 items-center justify-center rounded-md border border-border/50 bg-muted/10 text-muted-foreground">
                          {fromNode.id === toNode.id ? "self" : "-"}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InfluenceBoard({
  rows,
  selectedGrain,
  onSelectGrain,
}: {
  rows: readonly InfluenceBoardRow[];
  selectedGrain: string;
  onSelectGrain: (grain: string) => void;
}) {
  const maxRank = Math.max(1, ...rows.map((row) => row.netRank));
  const points = influenceBoardPoints(rows, maxRank);
  const pointByNodeId = new Map(points.map((point) => [point.row.node.id, point]));
  const selectedPoint = points.find((point) => point.row.node.label === selectedGrain) ?? points[0];
  const selectedEdges = selectedPoint
    ? [...selectedPoint.row.incomingEdges, ...selectedPoint.row.outgoingEdges]
      .filter((edge) => pointByNodeId.has(edge.from) && pointByNodeId.has(edge.to))
      .sort((left, right) => right.rank - left.rank)
      .slice(0, 8)
    : [];

  if (!selectedPoint) return null;

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Influence board</p>
          <h4 className="mt-1 font-display text-lg font-semibold">Current read vs relationship rank</h4>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
            Horizontal position is total relationship rank. Vertical position is the current board read, pulled toward
            neutral when confidence is lower. Tied ranks are spaced so labels stay readable.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className={cn("tabular-nums", boardReadToneClass(selectedPoint.row.read))}>
            {selectedPoint.row.node.label} {boardReadLabel(selectedPoint.row.read)}
          </Badge>
          <Badge variant="outline" className="border-border bg-background/70 text-muted-foreground tabular-nums">
            net rank {selectedPoint.row.netRank}
          </Badge>
          <Badge variant="outline" className="border-border bg-background/70 text-muted-foreground tabular-nums">
            {selectedPoint.row.outboundRank} out / {selectedPoint.row.inboundRank} in
          </Badge>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border border-border bg-background/80">
        <svg
          role="img"
          aria-labelledby="grain-influence-board-title grain-influence-board-description"
          className="block min-w-[900px]"
          viewBox={`0 0 ${INFLUENCE_BOARD_WIDTH} ${INFLUENCE_BOARD_HEIGHT}`}
        >
          <title id="grain-influence-board-title">Influence board</title>
          <desc id="grain-influence-board-description">
            Scatter view of current grain reads against relationship rank, with selected grain links highlighted.
          </desc>
          <defs>
            {(["score_input", "bounded_context", "watch_only", "parked_gap"] as const).map((scoreRole) => (
              <marker
                key={`influence-board-${scoreRole}`}
                id={`influence-board-${scoreRole}`}
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="4"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M0,0 L8,4 L0,8 z" fill={scoreRoleStroke(scoreRole)} />
              </marker>
            ))}
          </defs>
          <rect x="0" y="0" width={INFLUENCE_BOARD_WIDTH} height={INFLUENCE_BOARD_HEIGHT} rx="8" className="fill-background" />
          <line x1="72" x2="912" y1={INFLUENCE_BOARD_CENTER_Y - INFLUENCE_BOARD_SCORE_RANGE_Y} y2={INFLUENCE_BOARD_CENTER_Y - INFLUENCE_BOARD_SCORE_RANGE_Y} className="stroke-border" strokeDasharray="4 8" />
          <line x1="72" x2="912" y1={INFLUENCE_BOARD_CENTER_Y} y2={INFLUENCE_BOARD_CENTER_Y} className="stroke-border" strokeWidth="1.4" />
          <line x1="72" x2="912" y1={INFLUENCE_BOARD_CENTER_Y + INFLUENCE_BOARD_SCORE_RANGE_Y} y2={INFLUENCE_BOARD_CENTER_Y + INFLUENCE_BOARD_SCORE_RANGE_Y} className="stroke-border" strokeDasharray="4 8" />
          <line x1={INFLUENCE_BOARD_MIN_X} x2={INFLUENCE_BOARD_MAX_X} y1="294" y2="294" className="stroke-border" />

          <text x="28" y={INFLUENCE_BOARD_CENTER_Y - INFLUENCE_BOARD_SCORE_RANGE_Y + 4} className="fill-muted-foreground" fontSize="11" fontWeight="700">
            Bull pressure
          </text>
          <text x="28" y={INFLUENCE_BOARD_CENTER_Y + 4} className="fill-muted-foreground" fontSize="11" fontWeight="700">
            Neutral
          </text>
          <text x="28" y={INFLUENCE_BOARD_CENTER_Y + INFLUENCE_BOARD_SCORE_RANGE_Y + 4} className="fill-muted-foreground" fontSize="11" fontWeight="700">
            Bear pressure
          </text>
          <text x={INFLUENCE_BOARD_MIN_X} y="318" className="fill-muted-foreground" fontSize="11" fontWeight="700">
            lower relationship rank
          </text>
          <text x={INFLUENCE_BOARD_MAX_X - 118} y="318" className="fill-muted-foreground" fontSize="11" fontWeight="700">
            higher relationship rank
          </text>

          {selectedEdges.map((edge) => {
            const from = pointByNodeId.get(edge.from);
            const to = pointByNodeId.get(edge.to);
            if (!from || !to) return null;
            const stroke = scoreRoleStroke(edge.scoreRole);
            const controlY = Math.min(from.y, to.y) - 44;

            return (
              <path
                key={`influence-board-edge-${edge.id}`}
                d={`M ${from.x} ${from.y} Q ${(from.x + to.x) / 2} ${controlY} ${to.x} ${to.y}`}
                fill="none"
                stroke={stroke}
                strokeOpacity="0.5"
                strokeWidth={Math.max(1.4, Math.min(4.4, 1 + edge.rank / 36))}
                markerEnd={`url(#influence-board-${edge.scoreRole})`}
              />
            );
          })}

          {points.map((point) => {
            const selected = point.row.node.label === selectedPoint.row.node.label;
            const confidence = confidenceWeight(point.row.read);
            const stroke = selected ? "#c17f24" : boardReadStroke(point.row.read);
            const fill = boardReadStroke(point.row.read);
            const labelY = influenceBoardLabelY(point);

            return (
              <g
                key={`influence-board-node-${point.row.node.id}`}
                role="button"
                tabIndex={0}
                aria-label={`Select ${point.row.node.label} on influence board`}
                className="cursor-pointer outline-none"
                onClick={() => onSelectGrain(point.row.node.label)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectGrain(point.row.node.label);
                  }
                }}
              >
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={point.radius + (selected ? 5 : 0)}
                  fill={selected ? "rgba(193, 127, 36, 0.16)" : "transparent"}
                  stroke={selected ? "#c17f24" : "transparent"}
                  strokeWidth={selected ? 2 : 0}
                />
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={point.radius}
                  fill={fill}
                  fillOpacity={0.28 + confidence * 0.46}
                  stroke={stroke}
                  strokeOpacity={selected ? 0.94 : 0.58}
                  strokeWidth={selected ? 2.4 : 1.4}
                />
                <text
                  x={point.x}
                  y={labelY}
                  textAnchor="middle"
                  className="fill-foreground"
                  fontSize="11"
                  fontWeight={selected ? "800" : "700"}
                >
                  {point.row.node.label}
                </text>
                <text
                  x={point.x}
                  y={labelY + 14}
                  textAnchor="middle"
                  className="fill-muted-foreground"
                  fontSize="10"
                >
                  {boardReadLabel(point.row.read)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function FocusNodeCard({ item }: { item: FocusedNode }) {
  const stroke = scoreRoleStroke(item.edge.scoreRole);

  return (
    <g transform={`translate(${item.x} ${item.y})`}>
      <rect
        width={FOCUS_NODE_WIDTH}
        height={FOCUS_NODE_HEIGHT}
        rx="7"
        fill={scoreRoleFill(item.edge.scoreRole)}
        stroke={stroke}
        strokeOpacity="0.62"
        strokeWidth="1.4"
      />
      <foreignObject x="10" y="8" width={FOCUS_NODE_WIDTH - 20} height={FOCUS_NODE_HEIGHT - 14}>
        <div className="flex h-full flex-col justify-center overflow-hidden text-[10px] leading-3 text-foreground">
          <div className="truncate font-semibold">{truncateLabel(item.node.label)}</div>
          <div className="mt-1 flex items-center gap-1.5 text-[9px] uppercase text-muted-foreground">
            <span>{relationshipKindLabel(item.edge.kind)}</span>
            <span className="tabular-nums">{item.edge.rank}</span>
          </div>
        </div>
      </foreignObject>
    </g>
  );
}

function FocusedRelationshipSvg({
  selected,
  selectedRead,
  incoming,
  outgoing,
}: {
  selected: GrainRelationshipOverviewNode;
  selectedRead?: GrainImpactGraphBoardRead;
  incoming: FocusedNode[];
  outgoing: FocusedNode[];
}) {
  const selectedX = 404;
  const selectedY = 182;
  const markerBaseId = `grain-focus-${selected.id}`;

  return (
    <div className="overflow-x-auto rounded-md border border-border bg-background/80">
      <svg
        role="img"
        aria-labelledby={`${markerBaseId}-title ${markerBaseId}-description`}
        className="block min-w-[900px]"
        viewBox={`0 0 ${FOCUS_WIDTH} ${FOCUS_HEIGHT}`}
      >
        <title id={`${markerBaseId}-title`}>{`${selected.label} relationship focus`}</title>
        <desc id={`${markerBaseId}-description`}>
          Focused incoming and outgoing relationship links for the selected grain.
        </desc>
        <defs>
          {(["score_input", "bounded_context", "watch_only", "parked_gap"] as const).map((scoreRole) => (
            <marker
              key={`${markerBaseId}-${scoreRole}`}
              id={`${markerBaseId}-${scoreRole}`}
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="4"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M0,0 L8,4 L0,8 z" fill={scoreRoleStroke(scoreRole)} />
            </marker>
          ))}
        </defs>
        <rect x="0" y="0" width={FOCUS_WIDTH} height={FOCUS_HEIGHT} rx="8" className="fill-background" />
        <text x="58" y="34" className="fill-muted-foreground" fontSize="12" fontWeight="700">
          Inbound links
        </text>
        <text x="420" y="34" className="fill-muted-foreground" fontSize="12" fontWeight="700">
          Selected grain
        </text>
        <text x="750" y="34" className="fill-muted-foreground" fontSize="12" fontWeight="700">
          Outbound links
        </text>

        {incoming.map((item) => {
          const startX = item.x + FOCUS_NODE_WIDTH;
          const startY = item.y + FOCUS_NODE_HEIGHT / 2;
          const endX = selectedX;
          const endY = selectedY + FOCUS_NODE_HEIGHT / 2;
          const stroke = scoreRoleStroke(item.edge.scoreRole);

          return (
            <path
              key={`incoming-${item.edge.id}`}
              d={`M ${startX} ${startY} C ${startX + 86} ${startY}, ${endX - 96} ${endY}, ${endX} ${endY}`}
              fill="none"
              stroke={stroke}
              strokeOpacity={0.28 + Math.min(0.5, item.edge.rank / 180)}
              strokeWidth={Math.max(1.4, Math.min(4.2, 1 + item.edge.rank / 34))}
              markerEnd={`url(#${markerBaseId}-${item.edge.scoreRole})`}
            />
          );
        })}

        {outgoing.map((item) => {
          const startX = selectedX + FOCUS_NODE_WIDTH;
          const startY = selectedY + FOCUS_NODE_HEIGHT / 2;
          const endX = item.x;
          const endY = item.y + FOCUS_NODE_HEIGHT / 2;
          const stroke = scoreRoleStroke(item.edge.scoreRole);

          return (
            <path
              key={`outgoing-${item.edge.id}`}
              d={`M ${startX} ${startY} C ${startX + 96} ${startY}, ${endX - 86} ${endY}, ${endX} ${endY}`}
              fill="none"
              stroke={stroke}
              strokeOpacity={0.28 + Math.min(0.5, item.edge.rank / 180)}
              strokeWidth={Math.max(1.4, Math.min(4.2, 1 + item.edge.rank / 34))}
              markerEnd={`url(#${markerBaseId}-${item.edge.scoreRole})`}
            />
          );
        })}

        <g transform={`translate(${selectedX} ${selectedY})`}>
          <rect
            width={FOCUS_NODE_WIDTH}
            height={FOCUS_NODE_HEIGHT}
            rx="7"
            fill={scoreRoleFill("score_input")}
            stroke={scoreRoleStroke("score_input")}
            strokeOpacity="0.72"
            strokeWidth="1.8"
          />
          <foreignObject x="10" y="8" width={FOCUS_NODE_WIDTH - 20} height={FOCUS_NODE_HEIGHT - 14}>
            <div className="flex h-full flex-col justify-center overflow-hidden text-[10px] leading-3 text-foreground">
              <div className="truncate font-semibold">{truncateLabel(selected.label)}</div>
              <div className="mt-1 flex items-center gap-1.5 text-[9px] uppercase text-muted-foreground">
                <span>{boardReadLabel(selectedRead)}</span>
                <span className="tabular-nums">
                  {selected.outgoingCount} out / {selected.incomingCount} in
                </span>
              </div>
            </div>
          </foreignObject>
        </g>

        {incoming.map((item) => (
          <FocusNodeCard key={`incoming-node-${item.edge.id}`} item={item} />
        ))}
        {outgoing.map((item) => (
          <FocusNodeCard key={`outgoing-node-${item.edge.id}`} item={item} />
        ))}
      </svg>
    </div>
  );
}

function RankedEdgeList({ title, edges }: { title: string; edges: GrainRelationshipOverviewEdge[] }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
        <Badge variant="outline" className="border-border bg-background/70 text-muted-foreground tabular-nums">
          {edges.length}
        </Badge>
      </div>
      <div className="grid gap-2">
        {edges.length === 0 ? (
          <div className="rounded-md border border-border bg-background p-3 text-xs leading-5 text-muted-foreground">
            No modeled relationship links for this side.
          </div>
        ) : (
          edges.map((edge) => (
            <div key={`ranked-${title}-${edge.id}`} className="rounded-md border border-border bg-background p-3 text-xs leading-5">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={scoreRoleClass(edge.scoreRole)}>
                  {scoreRoleLabel(edge.scoreRole)}
                </Badge>
                <Badge variant="outline" className="border-border bg-muted/40 text-muted-foreground">
                  {relationshipKindLabel(edge.kind)}
                </Badge>
                <Badge variant="outline" className="border-border bg-background/70 text-muted-foreground tabular-nums">
                  {edge.rank}
                </Badge>
              </div>
              <p className="font-semibold text-foreground">
                {edge.fromLabel} to {edge.toLabel}
              </p>
              <p className="mt-1 text-muted-foreground">{edge.note}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function strongestEdge(edges: GrainRelationshipOverviewEdge[]): GrainRelationshipOverviewEdge | undefined {
  return edges
    .slice()
    .sort((left, right) => {
      if (left.rank !== right.rank) return right.rank - left.rank;
      return `${left.fromLabel}-${left.toLabel}`.localeCompare(`${right.fromLabel}-${right.toLabel}`);
    })[0];
}

function InfluenceLensCard({
  title,
  edge,
  empty,
}: {
  title: string;
  edge: GrainRelationshipOverviewEdge | undefined;
  empty: string;
}) {
  return (
    <div className="rounded-md border border-border bg-background p-3 text-xs leading-5">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {edge ? (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={scoreRoleClass(edge.scoreRole)}>
              {scoreRoleLabel(edge.scoreRole)}
            </Badge>
            <Badge variant="outline" className="border-border bg-muted/40 text-muted-foreground">
              {relationshipKindLabel(edge.kind)}
            </Badge>
            <Badge variant="outline" className="border-border bg-background/70 text-muted-foreground tabular-nums">
              {edge.rank}
            </Badge>
          </div>
          <p className="font-semibold text-foreground">
            {edge.fromLabel} to {edge.toLabel}
          </p>
          <p className="mt-1 text-muted-foreground">{edge.note}</p>
        </>
      ) : (
        <p className="text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}

function SelectedInfluenceLens({
  selected,
  selectedRead,
  incomingEdges,
  outgoingEdges,
}: {
  selected: GrainRelationshipOverviewNode;
  selectedRead?: GrainImpactGraphBoardRead;
  incomingEdges: GrainRelationshipOverviewEdge[];
  outgoingEdges: GrainRelationshipOverviewEdge[];
}) {
  const inboundRank = incomingEdges.reduce((sum, edge) => sum + edge.rank, 0);
  const outboundRank = outgoingEdges.reduce((sum, edge) => sum + edge.rank, 0);
  const externalWatchEdges = outgoingEdges.filter(
    (edge) => !edge.targetInPublicScope && (edge.scoreRole === "watch_only" || edge.scoreRole === "parked_gap"),
  );
  const strongestInbound = strongestEdge(incomingEdges);
  const strongestOutbound = strongestEdge(outgoingEdges);
  const strongestWatch = strongestEdge(externalWatchEdges);

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Selected Influence Lens</p>
          <h4 className="mt-1 font-display text-lg font-semibold">{selected.label} relationship lens</h4>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
            Focused view of what this grain pushes, what pushes it, and which outside anchors stay watch-only.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className={cn("tabular-nums", boardReadToneClass(selectedRead))}>
            current board read {boardReadLabel(selectedRead)}
          </Badge>
          <Badge variant="outline" className="border-border bg-background/70 text-muted-foreground tabular-nums">
            net relationship rank {inboundRank + outboundRank}
          </Badge>
          <Badge variant="outline" className="border-border bg-background/70 text-muted-foreground tabular-nums">
            {outboundRank} out / {inboundRank} in
          </Badge>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <InfluenceLensCard
          title="Strongest outbound"
          edge={strongestOutbound}
          empty="No modeled outbound relationship from this grain."
        />
        <InfluenceLensCard
          title="Strongest inbound"
          edge={strongestInbound}
          empty="No modeled inbound relationship into this grain."
        />
        <InfluenceLensCard
          title="Watch-only anchor"
          edge={strongestWatch}
          empty="No external watch-only anchor for this selected grain."
        />
      </div>
    </div>
  );
}

function ConversationReadBadge({
  label,
  read,
}: {
  label: string;
  read: GrainImpactGraphBoardRead | undefined;
}) {
  return (
    <Badge variant="outline" className={cn("tabular-nums", boardReadToneClass(read))}>
      {label} {boardReadLabel(read)}
    </Badge>
  );
}

function SelectedLinkRankProof({
  edges,
  readsByGrain,
}: {
  edges: readonly GrainRelationshipOverviewEdge[];
  readsByGrain: Map<string, GrainImpactGraphBoardRead>;
}) {
  const proofEdges = edges.slice(0, 4);

  return (
    <div className="space-y-3 rounded-md border border-border bg-background p-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Link rank proof</p>
          <h4 className="mt-1 font-display text-lg font-semibold">Why these grains are talking</h4>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
            Rank is based on source authority and whether the other side is inside the public V1 board. Current reads
            show whether the two grains are agreeing, diverging, or still neutral.
          </p>
        </div>
        <Badge variant="outline" className="w-fit border-border bg-muted/40 text-muted-foreground tabular-nums">
          {proofEdges.length} proof links
        </Badge>
      </div>

      <div className="grid gap-2 lg:grid-cols-2">
        {proofEdges.map((edge) => (
          <div key={`link-proof-${edge.id}`} className="rounded-md border border-border bg-card p-3 text-xs leading-5">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={scoreRoleClass(edge.scoreRole)}>
                {scoreRoleLabel(edge.scoreRole)}
              </Badge>
              <Badge variant="outline" className="border-border bg-muted/40 text-muted-foreground">
                {relationshipKindLabel(edge.kind)}
              </Badge>
              <Badge variant="outline" className="border-border bg-background/70 text-muted-foreground">
                {sourceClassLabel(edge.sourceClass)}
              </Badge>
              <Badge variant="outline" className="border-border bg-background/70 text-muted-foreground tabular-nums">
                rank {edge.rank}
              </Badge>
            </div>
            <p className="font-semibold text-foreground">
              {edge.fromLabel} to {edge.toLabel}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <ConversationReadBadge label={edge.fromLabel} read={readsByGrain.get(edge.fromLabel)} />
              {edge.targetInPublicScope ? (
                <ConversationReadBadge label={edge.toLabel} read={readsByGrain.get(edge.toLabel)} />
              ) : (
                <Badge variant="outline" className="border-amber-600/25 bg-amber-500/10 text-amber-800 dark:text-amber-300">
                  {edge.toLabel} external anchor
                </Badge>
              )}
            </div>
            <p className="mt-2 font-medium text-foreground">{rankProofLabel(edge)}</p>
            <p className="mt-1 text-muted-foreground">{edge.note}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// Stable default: an inline `= []` default would change identity on every render
// and invalidate the read-keyed memos below.
const NO_BOARD_READS: readonly GrainImpactGraphBoardRead[] = [];

export function GrainRelationshipExplorer({
  overview,
  boardReads = NO_BOARD_READS,
}: {
  overview: GrainRelationshipOverviewModel;
  boardReads?: readonly GrainImpactGraphBoardRead[];
}) {
  const grainNodes = useMemo(
    () => overview.nodes.filter((node) => node.kind === "grain"),
    [overview.nodes],
  );
  const [selectedGrain, setSelectedGrain] = useState(grainNodes[0]?.label ?? "");
  const selectedNode = grainNodes.find((node) => node.label === selectedGrain) ?? grainNodes[0];
  const readsByGrain = useMemo(() => boardReadByGrain(boardReads), [boardReads]);
  const selectedRead = selectedNode ? readsByGrain.get(selectedNode.label) : undefined;
  const nodesById = useMemo(
    () => new Map(overview.nodes.map((node) => [node.id, node])),
    [overview.nodes],
  );
  const influenceRows = useMemo(
    () => influenceBoardRows({ overview, grainNodes, readsByGrain }),
    [overview, grainNodes, readsByGrain],
  );

  if (!selectedNode) return null;

  const incomingEdges = overview.edges.filter((edge) => edge.to === selectedNode.id);
  const outgoingEdges = overview.edges.filter((edge) => edge.from === selectedNode.id);
  const incomingNodes = nodeRows(incomingEdges, nodesById, "incoming");
  const outgoingNodes = nodeRows(outgoingEdges, nodesById, "outgoing");

  const rankedEdges = [...incomingEdges, ...outgoingEdges]
    .sort((left, right) => {
      if (left.rank !== right.rank) return right.rank - left.rank;
      return `${left.fromLabel}-${left.toLabel}`.localeCompare(`${right.fromLabel}-${right.toLabel}`);
    });

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="font-display text-xl font-semibold">Grain Focus Explorer</h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            Selected-grain relationship lanes with inbound anchors, outbound influence, and ranked link strength.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="border-border bg-background/70 text-muted-foreground tabular-nums">
            {incomingEdges.length} inbound
          </Badge>
          <Badge variant="outline" className="border-border bg-background/70 text-muted-foreground tabular-nums">
            {outgoingEdges.length} outbound
          </Badge>
          <Badge variant="outline" className="border-canola/35 bg-canola/10 text-canola tabular-nums">
            {rankedEdges.length} ranked links
          </Badge>
          <Badge variant="outline" className={cn("tabular-nums", boardReadToneClass(selectedRead))}>
            {selectedNode.label} current board read {boardReadLabel(selectedRead)}
          </Badge>
          {selectedRead ? (
            <Badge variant="outline" className="border-border bg-background/70 text-muted-foreground">
              {boardReadSourceLabel(selectedRead.scoreSource)}
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Grain relationship focus">
        {grainNodes.map((node) => {
          const active = node.label === selectedNode.label;
          const read = readsByGrain.get(node.label);
          return (
            <Button
              key={`grain-focus-${node.id}`}
              type="button"
              variant={active ? "default" : "outline"}
              size="sm"
              aria-pressed={active}
              className={cn(
                "tabular-nums",
                active ? "bg-canola text-white hover:bg-canola/90" : "border-border bg-background/70 text-foreground",
              )}
              onClick={() => setSelectedGrain(node.label)}
            >
              {node.label}
              <span className="text-xs opacity-80">
                {read?.score === null || read?.score === undefined
                  ? `${node.outgoingCount}/${node.incomingCount}`
                  : formatSignedScore(read.score)}
              </span>
            </Button>
          );
        })}
      </div>

      <InfluenceBoard
        rows={influenceRows}
        selectedGrain={selectedNode.label}
        onSelectGrain={setSelectedGrain}
      />

      <GrainConversationMatrix
        overview={overview}
        grainNodes={grainNodes}
        selectedGrain={selectedNode.label}
        onSelectGrain={setSelectedGrain}
      />

      <FocusedRelationshipSvg
        selected={selectedNode}
        selectedRead={selectedRead}
        incoming={incomingNodes}
        outgoing={outgoingNodes}
      />

      <SelectedInfluenceLens
        selected={selectedNode}
        selectedRead={selectedRead}
        incomingEdges={incomingEdges}
        outgoingEdges={outgoingEdges}
      />

      <SelectedLinkRankProof edges={rankedEdges} readsByGrain={readsByGrain} />

      <div className="grid gap-3 lg:grid-cols-2">
        <RankedEdgeList title="Inbound ranked links" edges={incomingEdges} />
        <RankedEdgeList title="Outbound ranked links" edges={outgoingEdges} />
      </div>
    </div>
  );
}
