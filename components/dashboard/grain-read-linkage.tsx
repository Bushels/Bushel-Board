import { buildGrainReadLinkageSummary, type GrainReadLinkageLane } from "@/lib/thesis/grain-read-linkage";
import { cn } from "@/lib/utils";

function laneRoleLabel(role: GrainReadLinkageLane["role"]): string {
  if (role === "score_input") return "official input";
  if (role === "bounded_context") return "price context";
  return "watch lead";
}

function laneDotClass(role: GrainReadLinkageLane["role"]): string {
  if (role === "score_input") return "bg-prairie";
  if (role === "bounded_context") return "bg-canola";
  return "bg-amber-500";
}

/**
 * Farmer-facing "What feeds this read" strip for a thesis grain card.
 * Renders the same deterministic linkage model the audit graph uses, condensed to
 * counts plus the strongest lanes. Display only — adds no scoring authority.
 */
export function GrainReadLinkage({ grain }: { grain: string }) {
  const summary = buildGrainReadLinkageSummary(grain);
  if (!summary) return null;

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4">
      <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-semibold">What feeds this read</p>
        <p className="text-xs tabular-nums text-muted-foreground">
          {summary.scoredCount} official inputs &middot; {summary.priceContextCount} price context &middot;{" "}
          {summary.watchOnlyCount} watch leads
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {summary.topLanes.map((lane) => (
          <span
            key={lane.id}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs text-foreground/90"
          >
            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", laneDotClass(lane.role))} />
            <span className="max-w-56 truncate">{lane.label}</span>
            <span className="text-muted-foreground">&middot; {laneRoleLabel(lane.role)}</span>
          </span>
        ))}
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        Only official sources and admitted price context can move this score. Watch leads point at what to check
        next; they never move the number on their own.
      </p>
    </div>
  );
}
