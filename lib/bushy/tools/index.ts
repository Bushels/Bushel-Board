// WS3 Task 3.3 — Bushy chat harness
// Tool registry: the canonical list of tools the harness exposes to the LLM.
//
// Discovery contract:
//   - buildToolRegistry(): async, memoized. Harness calls once per request.
//   - findTool(name): sync, returns the tool by name from the materialized
//     registry. Called during streaming to resolve tool-call requests from
//     the model.
//
// Why async build: Phase 2 will bridge MCP tools (stdio/SSE server
// connections) which are an async load. Returning Promise<BushyTool[]>
// today keeps the API forward-compatible without changing call sites.
//
// Native tools present at WS3 (7):
//   save_extraction, supersede_knowledge, query_working_memory,
//   query_market_thesis, query_posted_prices, query_area_intelligence,
//   search_x
//
// Weather tool (get_weather) lands in WS4 — it will be added to
// NATIVE_TOOLS below once lib/bushy/tools/weather/ exports it.

import {
  saveExtractionTool,
  supersedeKnowledgeTool,
  queryWorkingMemoryTool,
} from "./memory";
import {
  queryMarketThesisTool,
  queryPostedPricesTool,
  queryAreaIntelligenceTool,
} from "./data";
import { searchXTool } from "./x-api";
import { toToolDefinition } from "./types";
import type { BushyTool, ToolContext, ToolResult } from "./types";
// import { getWeatherTool } from './weather';  // WS4 Task 4.4 adds this
// import { loadMcpTools } from './mcp-bridge'; // Phase 2 (post-launch)
// import { MCP_SERVERS } from './mcp-config';

const NATIVE_TOOLS: BushyTool[] = [
  saveExtractionTool,
  supersedeKnowledgeTool,
  queryWorkingMemoryTool,
  queryMarketThesisTool,
  queryPostedPricesTool,
  queryAreaIntelligenceTool,
  searchXTool,
];

let _registry: BushyTool[] | null = null;

/**
 * Materialize the tool registry. Idempotent: calls after the first are
 * O(1) and return the same array reference. The harness should call this
 * once per request (before streaming) and pass the result to the adapter
 * as `tools`.
 */
export async function buildToolRegistry(): Promise<BushyTool[]> {
  if (_registry) return _registry;
  // Phase 2: const mcpTools = await loadMcpTools(MCP_SERVERS);
  _registry = [...NATIVE_TOOLS];

  // Duplicate-name guard — catches a common bug where two tool files
  // accidentally use the same name and the second one shadows the first.
  const seen = new Set<string>();
  for (const t of _registry) {
    if (seen.has(t.name)) {
      throw new Error(
        `Duplicate tool name in registry: ${t.name}. Tool names must be unique.`,
      );
    }
    seen.add(t.name);
  }

  return _registry;
}

/**
 * Resolve a tool by name from the already-materialized registry. Returns
 * undefined if the name is unknown (the harness should reject the
 * LLM's tool call with a helpful error in that case).
 *
 * Note: does NOT auto-materialize the registry — buildToolRegistry must
 * have been called first. Keeps findTool sync for streaming-dispatch
 * call sites.
 */
export function findTool(name: string): BushyTool | undefined {
  return _registry?.find((t) => t.name === name);
}

/**
 * TEST-ONLY: reset the memoized registry so each test starts clean.
 * The harness never calls this in production.
 */
export function __resetRegistryForTests(): void {
  _registry = null;
}

export { toToolDefinition };
export type { BushyTool, ToolContext, ToolResult };
