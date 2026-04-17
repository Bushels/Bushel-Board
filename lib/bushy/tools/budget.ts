// WS3 Task 3.2 — Bushy chat harness
// ToolBudget: runaway-cost killer for the tool-use loop.
//
// The harness calls canCall() BEFORE dispatching each tool request from the
// model. If canCall returns false, the harness replies to the model with
// an error message ("budget exceeded") so it can choose a different action
// rather than silently retrying.
//
// Three dimensions, all ANDed:
//   1. Fleet-wide conversation cost cap (total USD)
//   2. Per-tool per-turn count (tool override takes precedence; fleet
//      default applies when no override)
//   3. Per-tool per-conversation count (same precedence rule)
//
// Lifecycle: instantiate once per conversation. Call startTurn() at the
// start of each user turn. Call recordCall(name, costUsd) after each
// successful tool execution. Read snapshot() at turn end for audit rows.

type Limits = {
  /** Per-user-turn cap for this specific tool. */
  perTurn?: number;
  /** Per-conversation cap for this specific tool. */
  perConversation?: number;
};

export interface ToolBudgetConfig {
  /** Fleet-wide per-turn call count ceiling (applies when no per-tool override). */
  perTurnMax: number;
  /** Fleet-wide per-conversation call count ceiling (applies when no per-tool override). */
  perConvMax: number;
  /** Total USD cost cap for the entire conversation. */
  costCapUsd: number;
}

export class ToolBudget {
  // Per-conversation call counts — never reset.
  private convCalls = new Map<string, number>();
  // Per-turn call counts — cleared by startTurn().
  private turnCalls = new Map<string, number>();
  private totalCostUsd = 0;

  constructor(private cfg: ToolBudgetConfig) {}

  /** Reset per-turn counters. Call at the start of each user turn. */
  startTurn(): void {
    this.turnCalls.clear();
  }

  /**
   * Check whether a tool is allowed to execute given current spend.
   * Pass the tool's own BushyTool.rateLimit to use its specific thresholds.
   */
  canCall(toolName: string, limits?: Limits): boolean {
    if (this.totalCostUsd >= this.cfg.costCapUsd) return false;

    const turnCount = this.turnCalls.get(toolName) ?? 0;
    const convCount = this.convCalls.get(toolName) ?? 0;

    const turnLimit = limits?.perTurn ?? this.cfg.perTurnMax;
    const convLimit = limits?.perConversation ?? this.cfg.perConvMax;

    if (turnCount >= turnLimit) return false;
    if (convCount >= convLimit) return false;
    return true;
  }

  /** Log a successful call. costUsd=0 is fine (e.g., local-only tools). */
  recordCall(toolName: string, costUsd: number): void {
    this.turnCalls.set(toolName, (this.turnCalls.get(toolName) ?? 0) + 1);
    this.convCalls.set(toolName, (this.convCalls.get(toolName) ?? 0) + 1);
    this.totalCostUsd += costUsd;
  }

  /** Snapshot for audit logging — convCalls breakdown + total cost. */
  snapshot(): { convCalls: Record<string, number>; totalCostUsd: number } {
    return {
      convCalls: Object.fromEntries(this.convCalls),
      totalCostUsd: this.totalCostUsd,
    };
  }
}
