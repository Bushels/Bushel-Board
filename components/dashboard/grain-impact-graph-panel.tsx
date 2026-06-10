import { Badge } from "@/components/ui/badge";
import { GrainRelationshipConstellation } from "@/components/dashboard/grain-relationship-constellation";
import { GrainRelationshipExplorer } from "@/components/dashboard/grain-relationship-explorer";
import {
  buildGrainImpactGraphs,
  buildGrainRelationshipRankRows,
  buildGrainRelationshipOverview,
  type GrainImpactGraphBoardRead,
  type GrainImpactGraphModel,
  type GrainImpactGraphNode,
  type GrainImpactGraphScoreRole,
  type GrainRelationshipRankLink,
  type GrainRelationshipRankRow,
  type GrainRelationshipOverviewEdge,
  type GrainRelationshipOverviewModel,
  type GrainRelationshipOverviewNode,
} from "@/lib/thesis/grain-impact-graph";
import { cn } from "@/lib/utils";

const NETWORK_WIDTH = 1180;
const NETWORK_LAYER_X = [56, 354, 652, 950] as const;
const NETWORK_NODE_WIDTH = 194;
const NETWORK_NODE_HEIGHT = 54;
const NETWORK_LAYER_LIMITS = new Map([
  [0, 7],
  [1, 7],
  [2, 6],
  [3, 1],
]);
const OVERVIEW_WIDTH = 1180;
const OVERVIEW_HEIGHT = 560;
const OVERVIEW_NODE_WIDTH = 154;
const OVERVIEW_NODE_HEIGHT = 50;

type NetworkNode = GrainImpactGraphNode & {
  synthetic?: boolean;
};

interface PositionedNetworkNode {
  node: NetworkNode;
  x: number;
  y: number;
}

function scoreRoleLabel(scoreRole: GrainImpactGraphScoreRole): string {
  if (scoreRole === "score_input") return "Scores";
  if (scoreRole === "bounded_context") return "Bounded context";
  if (scoreRole === "watch_only") return "Watch only";
  return "Blocked gap";
}

function formatSignedScore(score: number | null): string {
  if (score === null) return "No score";
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

function boardReadStroke(read: GrainImpactGraphBoardRead | undefined): string {
  if (!read || read.score === null) return "#7c6c43";
  if (read.score > 0) return "#437a22";
  if (read.score < 0) return "#d97706";
  return "#7c6c43";
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

function scoreRoleClass(scoreRole: GrainImpactGraphScoreRole): string {
  if (scoreRole === "score_input") return "border-prairie/25 bg-prairie/10 text-prairie";
  if (scoreRole === "bounded_context") return "border-canola/35 bg-canola/10 text-canola";
  if (scoreRole === "watch_only") return "border-amber-600/25 bg-amber-500/10 text-amber-800 dark:text-amber-300";
  return "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300";
}

function nodeKindLabel(kind: GrainImpactGraphNode["kind"]): string {
  return kind.replaceAll("_", " ");
}

function relationshipKindLabel(kind: GrainRelationshipOverviewEdge["kind"]): string {
  return kind.replaceAll("_", " ");
}

function svgId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface PositionedOverviewNode {
  node: GrainRelationshipOverviewNode;
  x: number;
  y: number;
}

function overviewNodePositions(overview: GrainRelationshipOverviewModel): PositionedOverviewNode[] {
  const grainNodes = overview.nodes.filter((node) => node.kind === "grain");
  const externalNodes = overview.nodes.filter((node) => node.kind === "external_anchor");
  const positioned: PositionedOverviewNode[] = [];
  const centerX = OVERVIEW_WIDTH / 2;
  const centerY = 220;
  const radiusX = 390;
  const radiusY = 150;

  grainNodes.forEach((node, index) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * index) / Math.max(1, grainNodes.length);
    positioned.push({
      node,
      x: centerX + Math.cos(angle) * radiusX - OVERVIEW_NODE_WIDTH / 2,
      y: centerY + Math.sin(angle) * radiusY - OVERVIEW_NODE_HEIGHT / 2,
    });
  });

  externalNodes.forEach((node, index) => {
    const gap = OVERVIEW_WIDTH / (externalNodes.length + 1);
    positioned.push({
      node,
      x: gap * (index + 1) - OVERVIEW_NODE_WIDTH / 2,
      y: 462,
    });
  });

  return positioned;
}

function OverviewNodeCard({
  item,
  boardRead,
}: {
  item: PositionedOverviewNode;
  boardRead?: GrainImpactGraphBoardRead;
}) {
  const stroke = item.node.kind === "grain" ? boardReadStroke(boardRead) : scoreRoleStroke(item.node.scoreRole);
  const node = item.node;

  return (
    <g transform={`translate(${item.x} ${item.y})`}>
      <rect
        width={OVERVIEW_NODE_WIDTH}
        height={OVERVIEW_NODE_HEIGHT}
        rx="7"
        fill={node.kind === "grain" ? scoreRoleFill("score_input") : scoreRoleFill(node.scoreRole)}
        stroke={stroke}
        strokeOpacity={node.kind === "grain" ? 0.78 : 0.46}
        strokeWidth={node.kind === "grain" ? 1.6 : 1.2}
      />
      <foreignObject x="10" y="7" width={OVERVIEW_NODE_WIDTH - 20} height={OVERVIEW_NODE_HEIGHT - 12}>
        <div className="flex h-full flex-col justify-center overflow-hidden text-[10px] leading-3 text-foreground">
          <div className="truncate font-semibold">{truncateLabel(node.label, 30)}</div>
          <div className="mt-1 flex items-center gap-1.5 text-[9px] uppercase text-muted-foreground">
            <span>{node.kind === "grain" ? boardReadLabel(boardRead) : scoreRoleLabel(node.scoreRole)}</span>
            <span className="tabular-nums">
              {node.outgoingCount} out / {node.incomingCount} in
            </span>
          </div>
        </div>
      </foreignObject>
    </g>
  );
}

function CrossGrainRelationshipMap({
  overview,
  boardReadsByGrain,
}: {
  overview: GrainRelationshipOverviewModel;
  boardReadsByGrain: Map<string, GrainImpactGraphBoardRead>;
}) {
  const nodes = overviewNodePositions(overview);
  const nodeById = new Map(nodes.map((item) => [item.node.id, item]));
  const markerBaseId = "cross-grain-relationship-map";

  return (
    <div className="overflow-x-auto rounded-md border border-border bg-background/80">
      <svg
        role="img"
        aria-labelledby={`${markerBaseId}-title ${markerBaseId}-description`}
        className="block min-w-[920px]"
        viewBox={`0 0 ${OVERVIEW_WIDTH} ${OVERVIEW_HEIGHT}`}
      >
        <title id={`${markerBaseId}-title`}>Cross-grain relationship map</title>
        <desc id={`${markerBaseId}-description`}>
          Board-wide map of grain-to-grain and external-anchor relationships from the impact profiles.
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
        <rect x="0" y="0" width={OVERVIEW_WIDTH} height={OVERVIEW_HEIGHT} rx="8" className="fill-background" />
        <text x="28" y="34" className="fill-muted-foreground" fontSize="12" fontWeight="700">
          Public V1 grains
        </text>
        <text x="28" y="438" className="fill-muted-foreground" fontSize="12" fontWeight="700">
          External anchors and parked context
        </text>
        <ellipse
          cx={OVERVIEW_WIDTH / 2}
          cy="220"
          rx="458"
          ry="184"
          fill="none"
          className="stroke-border"
          strokeDasharray="5 10"
        />
        <line x1="28" x2={OVERVIEW_WIDTH - 28} y1="418" y2="418" className="stroke-border" strokeDasharray="5 10" />

        {overview.edges.map((edge) => {
          const from = nodeById.get(edge.from);
          const to = nodeById.get(edge.to);
          if (!from || !to) return null;

          const fromCenterX = from.x + OVERVIEW_NODE_WIDTH / 2;
          const fromCenterY = from.y + OVERVIEW_NODE_HEIGHT / 2;
          const toCenterX = to.x + OVERVIEW_NODE_WIDTH / 2;
          const toCenterY = to.y + OVERVIEW_NODE_HEIGHT / 2;
          const curve = edge.targetInPublicScope ? 62 : 110;
          const controlX = (fromCenterX + toCenterX) / 2;
          const controlY = Math.min(fromCenterY, toCenterY) - curve;
          const stroke = scoreRoleStroke(edge.scoreRole);

          return (
            <path
              key={`overview-edge-${edge.id}`}
              d={`M ${fromCenterX} ${fromCenterY} Q ${controlX} ${controlY} ${toCenterX} ${toCenterY}`}
              fill="none"
              stroke={stroke}
              strokeOpacity={0.24 + Math.min(0.44, edge.rank / 190)}
              strokeWidth={Math.max(1.3, Math.min(4.4, 1 + edge.rank / 32))}
              markerEnd={`url(#${markerBaseId}-${edge.scoreRole})`}
            />
          );
        })}

        {nodes.map((item) => (
          <OverviewNodeCard
            key={`overview-node-${item.node.id}`}
            item={item}
            boardRead={item.node.kind === "grain" ? boardReadsByGrain.get(item.node.label) : undefined}
          />
        ))}
      </svg>
    </div>
  );
}

function CrossGrainRelationshipList({ overview }: { overview: GrainRelationshipOverviewModel }) {
  return (
    <div className="grid gap-2 lg:grid-cols-2">
      {overview.edges.slice(0, 10).map((edge) => (
        <div
          key={`overview-list-${edge.id}`}
          className="rounded-md border border-border bg-background p-3 text-xs leading-5"
        >
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
      ))}
    </div>
  );
}

function CurrentBoardOverlaySummary({ boardReads }: { boardReads: readonly GrainImpactGraphBoardRead[] }) {
  const activeReads = boardReads.filter((read) => read.score !== null);
  const bullCount = activeReads.filter((read) => (read.score ?? 0) > 0).length;
  const bearCount = activeReads.filter((read) => (read.score ?? 0) < 0).length;
  const balancedCount = activeReads.filter((read) => read.score === 0).length;

  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="border-border bg-muted/40 text-muted-foreground">
          Current board overlay
        </Badge>
        <Badge variant="outline" className="border-prairie/25 bg-prairie/10 text-prairie tabular-nums">
          {bullCount} bull
        </Badge>
        <Badge variant="outline" className="border-amber-600/25 bg-amber-500/10 text-amber-800 dark:text-amber-300 tabular-nums">
          {bearCount} bear
        </Badge>
        <Badge variant="outline" className="border-border bg-background/70 text-muted-foreground tabular-nums">
          {balancedCount} balanced
        </Badge>
      </div>
      <div className="flex flex-wrap gap-2">
        {boardReads.map((read) => (
          <Badge
            key={`board-read-${read.grain}`}
            variant="outline"
            className={cn("tabular-nums", boardReadToneClass(read))}
          >
            {read.grain} current board read {boardReadLabel(read)} ({boardReadSourceLabel(read.scoreSource)})
          </Badge>
        ))}
      </div>
    </div>
  );
}

function rankLinkLabel(link: GrainRelationshipRankLink | null, direction: "outbound" | "inbound"): string {
  if (!link) return direction === "outbound" ? "No outbound link" : "No inbound link";
  const prefix = direction === "outbound" ? "to" : "from";
  return `${prefix} ${link.grain} (${relationshipKindLabel(link.kind)}, ${link.rank})`;
}

function CrossGrainInfluenceRanking({ rows }: { rows: readonly GrainRelationshipRankRow[] }) {
  return (
    <div className="space-y-3 rounded-md border border-border bg-background p-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Influence ranking matrix</p>
          <h4 className="mt-1 font-display text-lg font-semibold">Which grains talk to each other most</h4>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            Net rank combines inbound and outbound relationship strength. It is relationship pressure, not a new market score.
          </p>
        </div>
        <Badge variant="outline" className="w-fit border-border bg-muted/40 text-muted-foreground tabular-nums">
          {rows.length} ranked grains
        </Badge>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] border-separate border-spacing-0 text-left text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th className="border-b border-border px-2 py-2 font-semibold">Grain</th>
              <th className="border-b border-border px-2 py-2 font-semibold">Board read</th>
              <th className="border-b border-border px-2 py-2 font-semibold">Net rank</th>
              <th className="border-b border-border px-2 py-2 font-semibold">Outbound</th>
              <th className="border-b border-border px-2 py-2 font-semibold">Inbound</th>
              <th className="border-b border-border px-2 py-2 font-semibold">Strongest outbound</th>
              <th className="border-b border-border px-2 py-2 font-semibold">Strongest inbound</th>
              <th className="border-b border-border px-2 py-2 font-semibold">Watch anchors</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`influence-rank-${row.grain}`} className="align-top">
                <td className="border-b border-border/70 px-2 py-2 font-semibold text-foreground">{row.grain}</td>
                <td className="border-b border-border/70 px-2 py-2">
                  <Badge variant="outline" className={cn("tabular-nums", boardReadToneClass({
                    grain: row.grain,
                    statusLabel: "",
                    score: row.currentReadScore,
                    confidence: row.currentReadConfidence,
                    canadaScore: null,
                    canadaConfidence: null,
                    usScore: null,
                    usConfidence: null,
                    scoreSource: row.currentReadScore === null ? "none" : "weekly_packet",
                  }))}>
                    {formatSignedScore(row.currentReadScore)} / {row.currentReadConfidence === null ? "n/a" : `${row.currentReadConfidence}%`}
                  </Badge>
                </td>
                <td className="border-b border-border/70 px-2 py-2 font-semibold tabular-nums text-foreground">{row.netRank}</td>
                <td className="border-b border-border/70 px-2 py-2 tabular-nums">
                  {row.outboundRank} across {row.outboundCount}
                </td>
                <td className="border-b border-border/70 px-2 py-2 tabular-nums">
                  {row.inboundRank} across {row.inboundCount}
                </td>
                <td className="border-b border-border/70 px-2 py-2 text-muted-foreground">
                  {rankLinkLabel(row.strongestOutbound, "outbound")}
                </td>
                <td className="border-b border-border/70 px-2 py-2 text-muted-foreground">
                  {rankLinkLabel(row.strongestInbound, "inbound")}
                </td>
                <td className="border-b border-border/70 px-2 py-2 tabular-nums text-muted-foreground">
                  {row.externalWatchCount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function graphNodeMeta(node: GrainImpactGraphNode): string {
  return [node.domain, node.scope].filter(Boolean).join(" / ").replaceAll("_", " ");
}

function DriverStackNodeCard({ node }: { node: GrainImpactGraphNode }) {
  return (
    <div className="rounded-md border border-border bg-background p-3 text-xs leading-5">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={scoreRoleClass(node.scoreRole)}>
          {scoreRoleLabel(node.scoreRole)}
        </Badge>
        {graphNodeMeta(node) ? (
          <Badge variant="outline" className="border-border bg-muted/40 text-muted-foreground">
            {graphNodeMeta(node)}
          </Badge>
        ) : null}
        <Badge variant="outline" className="border-border bg-background/70 text-muted-foreground tabular-nums">
          {node.rank}
        </Badge>
      </div>
      <p className="font-semibold text-foreground">{node.label}</p>
      <p className="mt-1 text-muted-foreground">{node.detail}</p>
    </div>
  );
}

function driverStackScoringNodes(graph: GrainImpactGraphModel): GrainImpactGraphNode[] {
  return graph.nodes
    .filter((node) => node.kind === "factor" && (node.scoreRole === "score_input" || node.scoreRole === "bounded_context"))
    .sort((left, right) => {
      if (left.rank !== right.rank) return right.rank - left.rank;
      return left.label.localeCompare(right.label);
    })
    .slice(0, 5);
}

function driverStackWatchNodes(graph: GrainImpactGraphModel): GrainImpactGraphNode[] {
  return graph.nodes
    .filter((node) => node.scoreRole === "watch_only" || node.scoreRole === "parked_gap")
    .sort((left, right) => {
      if (left.rank !== right.rank) return right.rank - left.rank;
      return left.label.localeCompare(right.label);
    })
    .slice(0, 5);
}

function CurrentDriverStackGallery({
  graphs,
  boardReads,
}: {
  graphs: readonly GrainImpactGraphModel[];
  boardReads: readonly GrainImpactGraphBoardRead[];
}) {
  const boardReadsByGrain = boardReadByGrain(boardReads);

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current Driver Stack</p>
          <h3 className="mt-1 font-display text-xl font-semibold">Source-to-score trail by grain</h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            Stable audit view of the highest-ranked scoring lanes, watch lanes, and parked gaps beside each current board read.
          </p>
        </div>
        <Badge variant="outline" className="w-fit border-border bg-background/70 text-muted-foreground tabular-nums">
          {graphs.length} grain stacks
        </Badge>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        {graphs.map((graph) => {
          const boardRead = boardReadsByGrain.get(graph.grain);
          const scoringFactors = driverStackScoringNodes(graph);
          const watchAndGapNodes = driverStackWatchNodes(graph);

          return (
            <div key={`driver-stack-${graph.grain}`} className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h4 className="font-display text-lg font-semibold">{graph.grain} source-to-score trail</h4>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{graph.marketStructure}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className={cn("tabular-nums", boardReadToneClass(boardRead))}>
                    {graph.grain} current board read {boardReadLabel(boardRead)}
                  </Badge>
                  {boardRead ? (
                    <Badge variant="outline" className="border-border bg-background/70 text-muted-foreground">
                      {boardReadSourceLabel(boardRead.scoreSource)}
                    </Badge>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Top scoring lanes</p>
                    <Badge variant="outline" className="border-border bg-background/70 text-muted-foreground tabular-nums">
                      {scoringFactors.length}
                    </Badge>
                  </div>
                  <div className="grid gap-2">
                    {scoringFactors.map((node) => (
                      <DriverStackNodeCard key={`score-driver-${graph.grain}-${node.id}`} node={node} />
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Watch and blocked lanes</p>
                    <Badge variant="outline" className="border-border bg-background/70 text-muted-foreground tabular-nums">
                      {watchAndGapNodes.length}
                    </Badge>
                  </div>
                  <div className="grid gap-2">
                    {watchAndGapNodes.map((node) => (
                      <DriverStackNodeCard key={`watch-driver-${graph.grain}-${node.id}`} node={node} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CrossGrainRelationshipOverview({
  overview,
  boardReads,
  rankRows,
}: {
  overview: GrainRelationshipOverviewModel;
  boardReads: readonly GrainImpactGraphBoardRead[];
  rankRows: readonly GrainRelationshipRankRow[];
}) {
  const boardReadsByGrain = boardReadByGrain(boardReads);

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="font-display text-xl font-semibold">Cross-Grain Relationship Map</h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            Board-wide view of which grains influence each other directly, and which external anchors stay watch-only
            or parked.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="border-border bg-background/70 text-muted-foreground tabular-nums">
            {overview.coverage.crossGrainRelationshipCount} grain links
          </Badge>
          <Badge variant="outline" className="border-border bg-background/70 text-muted-foreground tabular-nums">
            {overview.coverage.externalAnchorRelationshipCount} external anchors
          </Badge>
          <Badge variant="outline" className="border-canola/35 bg-canola/10 text-canola tabular-nums">
            {overview.coverage.priceContextCount} price-context links
          </Badge>
          <Badge variant="outline" className="border-amber-600/25 bg-amber-500/10 text-amber-800 dark:text-amber-300 tabular-nums">
            {overview.coverage.watchOnlyCount} watch-only links
          </Badge>
        </div>
      </div>
      <CurrentBoardOverlaySummary boardReads={boardReads} />
      <CrossGrainRelationshipMap overview={overview} boardReadsByGrain={boardReadsByGrain} />
      <CrossGrainInfluenceRanking rows={rankRows} />
      <CrossGrainRelationshipList overview={overview} />
    </div>
  );
}

function visibleNetworkNodes(graph: GrainImpactGraphModel): PositionedNetworkNode[] {
  const positioned: PositionedNetworkNode[] = [];

  for (const layer of [0, 1, 2, 3]) {
    const layerNodes = graph.nodes
      .filter((node) => node.layer === layer)
      .slice()
      .sort((left, right) => {
        if (left.rank !== right.rank) return right.rank - left.rank;
        return left.label.localeCompare(right.label);
      });
    const limit = NETWORK_LAYER_LIMITS.get(layer) ?? layerNodes.length;
    const visibleNodes: NetworkNode[] = layerNodes.slice(0, limit);
    const hiddenCount = Math.max(0, layerNodes.length - visibleNodes.length);

    if (hiddenCount > 0) {
      visibleNodes.push({
        id: `${graph.grain}-layer-${layer}-hidden`,
        kind: layer === 1 ? "factor" : "source",
        label: `+${hiddenCount} more`,
        detail: `${hiddenCount} lower-ranked ${layerTitle(layer).toLowerCase()} kept in the proof list below.`,
        layer,
        rank: 0,
        scoreRole: "watch_only",
        synthetic: true,
      });
    }

    const availableHeight = 500;
    const gap = visibleNodes.length <= 1 ? 0 : availableHeight / (visibleNodes.length - 1);
    const startY =
      visibleNodes.length <= 1
        ? 262
        : Math.max(58, 305 - ((visibleNodes.length - 1) * Math.min(gap, 72)) / 2);

    visibleNodes.forEach((node, index) => {
      positioned.push({
        node,
        x: NETWORK_LAYER_X[layer as 0 | 1 | 2 | 3],
        y: startY + index * Math.min(gap || 0, 72),
      });
    });
  }

  return positioned;
}

function truncateLabel(value: string, length = 48): string {
  if (value.length <= length) return value;
  return `${value.slice(0, length - 1).trimEnd()}...`;
}

function NetworkNodeCard({ item }: { item: PositionedNetworkNode }) {
  const { node, x, y } = item;
  const stroke = scoreRoleStroke(node.scoreRole);

  return (
    <g transform={`translate(${x} ${y})`}>
      <rect
        width={NETWORK_NODE_WIDTH}
        height={NETWORK_NODE_HEIGHT}
        rx="7"
        fill={scoreRoleFill(node.scoreRole)}
        stroke={stroke}
        strokeOpacity={node.synthetic ? 0.28 : 0.62}
        strokeWidth={node.synthetic ? 1 : 1.4}
      />
      <foreignObject x="10" y="8" width={NETWORK_NODE_WIDTH - 20} height={NETWORK_NODE_HEIGHT - 14}>
        <div className="flex h-full flex-col justify-center overflow-hidden text-[10px] leading-3 text-foreground">
          <div className="truncate font-semibold">{truncateLabel(node.label, 42)}</div>
          <div className="mt-1 flex items-center gap-1.5 text-[9px] uppercase text-muted-foreground">
            <span>{node.synthetic ? "more" : scoreRoleLabel(node.scoreRole)}</span>
            {node.rank > 0 ? <span className="tabular-nums">{node.rank}</span> : null}
          </div>
        </div>
      </foreignObject>
    </g>
  );
}

function GrainRelationshipNetwork({ graph }: { graph: GrainImpactGraphModel }) {
  const nodes = visibleNetworkNodes(graph);
  const nodeById = new Map(nodes.map((item) => [item.node.id, item]));
  const visibleNodeIds = new Set(nodes.filter((item) => !item.node.synthetic).map((item) => item.node.id));
  const edges = graph.edges
    .filter((edge) => visibleNodeIds.has(edge.from) && visibleNodeIds.has(edge.to))
    .sort((left, right) => right.rank - left.rank)
    .slice(0, 34);
  const markerBaseId = svgId(`${graph.grain}-impact-network`);

  return (
    <div className="overflow-x-auto rounded-md border border-border bg-background/80">
      <svg
        role="img"
        aria-labelledby={`${markerBaseId}-title ${markerBaseId}-description`}
        className="block min-w-[920px]"
        viewBox={`0 0 ${NETWORK_WIDTH} 620`}
      >
        <title id={`${markerBaseId}-title`}>{`${graph.grain} ranked relationship network`}</title>
        <desc id={`${markerBaseId}-description`}>
          Ranked source, factor, score-domain, and grain nodes connected by weighted relationship links.
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

        <rect x="0" y="0" width={NETWORK_WIDTH} height="620" rx="8" className="fill-background" />
        {[0, 1, 2, 3].map((layer) => (
          <g key={`${graph.grain}-network-layer-${layer}`}>
            <text
              x={NETWORK_LAYER_X[layer as 0 | 1 | 2 | 3]}
              y="32"
              className="fill-muted-foreground"
              fontSize="12"
              fontWeight="700"
            >
              {layerTitle(layer)}
            </text>
            <line
              x1={NETWORK_LAYER_X[layer as 0 | 1 | 2 | 3] - 18}
              x2={NETWORK_LAYER_X[layer as 0 | 1 | 2 | 3] - 18}
              y1="48"
              y2="592"
              className="stroke-border"
              strokeDasharray="4 8"
            />
          </g>
        ))}

        {edges.map((edge) => {
          const from = nodeById.get(edge.from);
          const to = nodeById.get(edge.to);
          if (!from || !to) return null;

          const startX = from.x + NETWORK_NODE_WIDTH;
          const startY = from.y + NETWORK_NODE_HEIGHT / 2;
          const endX = to.x;
          const endY = to.y + NETWORK_NODE_HEIGHT / 2;
          const controlOffset = Math.max(74, (endX - startX) / 2);
          const stroke = scoreRoleStroke(edge.scoreRole);
          const width = Math.max(1.2, Math.min(4.6, 1 + edge.rank / 34));

          return (
            <path
              key={`${graph.grain}-network-edge-${edge.id}`}
              d={`M ${startX} ${startY} C ${startX + controlOffset} ${startY}, ${endX - controlOffset} ${endY}, ${endX} ${endY}`}
              fill="none"
              stroke={stroke}
              strokeOpacity={0.22 + Math.min(0.46, edge.rank / 180)}
              strokeWidth={width}
              markerEnd={`url(#${markerBaseId}-${edge.scoreRole})`}
            />
          );
        })}

        {nodes.map((item) => (
          <NetworkNodeCard key={`${graph.grain}-network-node-${item.node.id}`} item={item} />
        ))}
      </svg>
    </div>
  );
}

function GraphNodeChip({ node }: { node: GrainImpactGraphNode }) {
  return (
    <div className="rounded-md border border-border bg-background p-2 shadow-sm">
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        <Badge variant="outline" className={scoreRoleClass(node.scoreRole)}>
          {scoreRoleLabel(node.scoreRole)}
        </Badge>
        <Badge variant="outline" className="border-border bg-muted/40 text-muted-foreground">
          {nodeKindLabel(node.kind)}
        </Badge>
        {node.rank > 0 ? (
          <Badge variant="outline" className="border-border bg-background/80 text-muted-foreground tabular-nums">
            {node.rank}
          </Badge>
        ) : null}
      </div>
      <p className="line-clamp-2 text-xs font-semibold leading-5 text-foreground">{node.label}</p>
      <p className="mt-1 line-clamp-3 text-[11px] leading-4 text-muted-foreground">{node.detail}</p>
    </div>
  );
}

function layerTitle(layer: number): string {
  if (layer === 0) return "Source, relationship, and gap lanes";
  if (layer === 1) return "Factor nodes";
  if (layer === 2) return "Score domains";
  return "Grain read";
}

function GraphColumn({ graph, layer }: { graph: GrainImpactGraphModel; layer: number }) {
  const nodes = graph.nodes.filter((node) => node.layer === layer);

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{layerTitle(layer)}</p>
        <Badge variant="outline" className="border-border bg-background/70 text-muted-foreground tabular-nums">
          {nodes.length}
        </Badge>
      </div>
      <div className="grid max-h-[420px] gap-2 overflow-y-auto pr-1">
        {nodes.map((node) => (
          <GraphNodeChip key={`${graph.grain}-${node.id}`} node={node} />
        ))}
      </div>
    </div>
  );
}

function GraphSummary({ graph }: { graph: GrainImpactGraphModel }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-md border border-border bg-background p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nodes</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{graph.coverage.nodeCount}</p>
      </div>
      <div className="rounded-md border border-border bg-background p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Links</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{graph.coverage.edgeCount}</p>
      </div>
      <div className="rounded-md border border-border bg-background p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Scoring factors</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{graph.coverage.scoreInputFactorCount}</p>
      </div>
      <div className="rounded-md border border-border bg-background p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Watch/gap lanes</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">
          {graph.coverage.watchOnlyFactorCount + graph.coverage.parkedGapCount}
        </p>
      </div>
    </div>
  );
}

function GraphEdgeList({ graph }: { graph: GrainImpactGraphModel }) {
  const nodeLabels = new Map(graph.nodes.map((node) => [node.id, node.label]));
  const rankedEdges = graph.edges.slice().sort((left, right) => right.rank - left.rank).slice(0, 12);

  return (
    <div className="space-y-2 rounded-md border border-border bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Top ranked links</p>
        <Badge variant="outline" className="border-border bg-muted/40 text-muted-foreground">
          {rankedEdges.length} shown
        </Badge>
      </div>
      <div className="space-y-2">
        {rankedEdges.map((edge) => (
          <div key={`${graph.grain}-${edge.id}`} className="grid gap-2 rounded-md border border-border/70 bg-muted/20 p-2 text-xs leading-5 md:grid-cols-[minmax(0,1fr)_100px_minmax(0,1fr)_64px] md:items-center">
            <span className="font-medium text-foreground">{nodeLabels.get(edge.from) ?? edge.from}</span>
            <span className="text-muted-foreground">{edge.label}</span>
            <span className="font-medium text-foreground">{nodeLabels.get(edge.to) ?? edge.to}</span>
            <Badge variant="outline" className={cn("w-fit tabular-nums", scoreRoleClass(edge.scoreRole))}>
              {edge.rank}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

function GrainGraphDetails({ graph, defaultOpen }: { graph: GrainImpactGraphModel; defaultOpen: boolean }) {
  return (
    <details className="rounded-lg border border-border bg-card p-4 shadow-sm" open={defaultOpen}>
      <summary className="cursor-pointer list-none">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-canola/35 bg-canola/10 text-canola">
                {graph.marketShape.replaceAll("_", " ")}
              </Badge>
              <Badge variant="outline" className="border-border bg-background/70 text-muted-foreground">
                {graph.coverage.factorCount} factors
              </Badge>
            </div>
            <h3 className="font-display text-xl font-semibold">{graph.grain} relationship graph</h3>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{graph.marketStructure}</p>
          </div>
          <Badge variant="outline" className="w-fit border-border bg-background/70 text-muted-foreground">
            Expand / collapse
          </Badge>
        </div>
      </summary>

      <div className="mt-4 space-y-4">
        <GraphSummary graph={graph} />
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Ranked relationship network
            </p>
            <Badge variant="outline" className="border-border bg-background/70 text-muted-foreground">
              {Math.min(graph.edges.length, 34)} weighted links
            </Badge>
          </div>
          <GrainRelationshipNetwork graph={graph} />
        </div>
        <div className="grid gap-3 xl:grid-cols-4">
          {[0, 1, 2, 3].map((layer) => (
            <GraphColumn key={`${graph.grain}-layer-${layer}`} graph={graph} layer={layer} />
          ))}
        </div>
        <GraphEdgeList graph={graph} />
      </div>
    </details>
  );
}

export function GrainImpactGraphPanel({
  grains,
  boardReads = [],
}: {
  grains: readonly string[];
  boardReads?: readonly GrainImpactGraphBoardRead[];
}) {
  const uniqueGrains = Array.from(new Set(grains));
  const graphs = buildGrainImpactGraphs(uniqueGrains);
  const relationshipOverview = buildGrainRelationshipOverview(uniqueGrains);
  const rankRows = buildGrainRelationshipRankRows({ overview: relationshipOverview, boardReads });

  if (graphs.length === 0) return null;

  const totalNodes = graphs.reduce((sum, graph) => sum + graph.coverage.nodeCount, 0);
  const totalEdges = graphs.reduce((sum, graph) => sum + graph.coverage.edgeCount, 0);

  return (
    <section className="scroll-mt-28 space-y-4" aria-labelledby="grain-impact-graph-heading">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge variant="outline" className="mb-3 w-fit border-canola/35 bg-canola/8 text-canola">
            Audit graph contract
          </Badge>
          <h2 id="grain-impact-graph-heading" className="font-display text-2xl font-semibold">
            Grain Impact Graph
          </h2>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            Operator-only relationship map showing how source lanes, factors, domains, watch leads, and parked gaps rank into each grain.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="border-border bg-background/70 text-muted-foreground tabular-nums">
            {graphs.length} grains
          </Badge>
          <Badge variant="outline" className="border-border bg-background/70 text-muted-foreground tabular-nums">
            {totalNodes} nodes
          </Badge>
          <Badge variant="outline" className="border-border bg-background/70 text-muted-foreground tabular-nums">
            {totalEdges} links
          </Badge>
        </div>
      </div>

      <CrossGrainRelationshipOverview overview={relationshipOverview} boardReads={boardReads} rankRows={rankRows} />
      <GrainRelationshipConstellation overview={relationshipOverview} boardReads={boardReads} />
      <CurrentDriverStackGallery graphs={graphs} boardReads={boardReads} />
      <GrainRelationshipExplorer overview={relationshipOverview} boardReads={boardReads} />

      <div className="grid gap-3">
        {graphs.map((graph, index) => (
          <GrainGraphDetails key={graph.grain} graph={graph} defaultOpen={index === 0} />
        ))}
      </div>
    </section>
  );
}
