import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";

export type KnowledgeRetrievalMode = "baseline" | "tiered";

interface RpcChunkRow {
  chunk_id: number;
  document_id: number;
  title: string;
  source_path: string;
  heading: string | null;
  content: string;
  grain_tags: string[];
  topic_tags: string[];
  region_tags: string[];
  source_priority: number;
  metadata: Record<string, unknown> | null;
  rank: number;
}

interface ChunkDetailRow {
  id: number;
  document_id: number;
  chunk_index: number;
  heading: string | null;
  content: string;
  grain_tags: string[];
  topic_tags: string[];
  region_tags: string[];
  source_priority: number;
  metadata: Record<string, unknown> | null;
  knowledge_documents:
    | {
        title: string;
        source_path: string;
      }
    | Array<{
        title: string;
        source_path: string;
      }>
    | null;
}

export interface RetrievedKnowledgeChunk {
  chunkId: number;
  documentId: number;
  chunkIndex: number | null;
  title: string;
  sourcePath: string;
  heading: string | null;
  content: string;
  grainTags: string[];
  topicTags: string[];
  regionTags: string[];
  sourcePriority: number;
  metadata: Record<string, unknown> | null;
  rank: number;
  score: number;
  matchedQueries: string[];
}

export interface KnowledgeQueryPlanEntry {
  id: string;
  label: string;
  query: string;
  limit: number;
}

export interface KnowledgeRetrievalResult {
  mode: KnowledgeRetrievalMode;
  grain: string;
  topicTags: string[];
  queryPlan: KnowledgeQueryPlanEntry[];
  sourcePaths: string[];
  contextText: string | null;
  chunks: RetrievedKnowledgeChunk[];
}

const BASELINE_LIMIT = 4;
const BASELINE_TOPICS = ["basis", "storage", "hedging", "deliveries", "marketing"] as const;
const TIERED_DEFAULT_TOPICS = ["basis", "storage", "marketing"] as const;
const TIERED_MAX_LIMIT = 4;
const TIERED_CANDIDATE_LIMIT = 8;

const INFERRED_TOPIC_PATTERNS: Array<{ tag: string; pattern: RegExp }> = [
  { tag: "basis", pattern: /\bbasis\b/i },
  { tag: "storage", pattern: /\bstor(age|e)\b|\bbin(s)?\b|\bcarry\b/i },
  { tag: "hedging", pattern: /\bhedg(e|ing|ed)\b/i },
  { tag: "futures", pattern: /\bfutures?\b|\bspread(s)?\b/i },
  { tag: "options", pattern: /\boption(s)?\b|\bput(s)?\b|\bcall(s)?\b/i },
  { tag: "deliveries", pattern: /\bdeliver(y|ies|ing)\b|\bhaul(ing)?\b/i },
  { tag: "exports", pattern: /\bexport(s|ed|ing)?\b/i },
  { tag: "stocks", pattern: /\bstock(s)?\b|\binventor(y|ies)\b/i },
  { tag: "logistics", pattern: /\blogistics\b|\bport(s)?\b|\brail\b|\bterminal(s)?\b|\bcongestion\b/i },
  { tag: "seasonality", pattern: /\bseason(al|ality)?\b|\bharvest\b|\bseeding\b/i },
  { tag: "marketing", pattern: /\bmarket(ing)?\b|\bprice\b|\bpricing\b|\bsell(ing)?\b/i },
  { tag: "contracts", pattern: /\bcontract(s|ed)?\b|\bdeferred delivery\b/i },
  { tag: "risk", pattern: /\brisk\b|\bdownside\b|\bprotect\b/i },
  { tag: "cot", pattern: /\bcot\b|\bmanaged money\b|\bcommercials\b|\bspecs\b|\bspeculative\b/i },
];

const TOPIC_HEADING_HINTS: Record<string, string[]> = {
  basis: ["basis", "bullish", "bearish"],
  storage: ["storage", "carry"],
  hedging: ["hedging", "contract", "option", "risk"],
  futures: ["futures", "carry", "spread"],
  options: ["option", "contract"],
  deliveries: ["export", "logistics", "transport"],
  exports: ["export", "transport", "logistics"],
  stocks: ["supply", "carry"],
  logistics: ["logistics", "transport", "regional"],
  seasonality: ["seasonal", "cyclical"],
  marketing: ["pricing", "selling", "contract"],
  contracts: ["contract", "pricing"],
  risk: ["risk"],
  cot: ["cot", "positioning", "divergence"],
};

const QUERY_MATCH_BONUSES: Record<string, number> = {
  "raw-question": 0.02,
  "grain-context": 0.01,
  "basis-storage-frameworks": 0.08,
  "hedging-contracts": 0.07,
  "cot-positioning": 0.08,
  "flow-logistics": 0.07,
};

function dedupe(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim())).map((value) => value.trim()))];
}

function inferMessageTopicSignals(messageText: string): string[] {
  return INFERRED_TOPIC_PATTERNS
    .filter(({ pattern }) => pattern.test(messageText))
    .map(({ tag }) => tag);
}

function compareNumbersDesc(a: number, b: number): number {
  return b - a;
}

function compareNullableNumbersAsc(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]+/g, " ");
}

function tokenize(value: string): string[] {
  return normalizeText(value).split(/\s+/).filter((token) => token.length > 2);
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function formatChunkForPrompt(chunk: RetrievedKnowledgeChunk): string {
  return `### ${chunk.title}${chunk.heading ? ` - ${chunk.heading}` : ""}\n${chunk.content}`;
}

function getDocumentMeta(row: ChunkDetailRow): { title: string; sourcePath: string } {
  if (Array.isArray(row.knowledge_documents)) {
    const doc = row.knowledge_documents[0];
    return {
      title: doc?.title ?? "Unknown knowledge source",
      sourcePath: doc?.source_path ?? "unknown",
    };
  }

  return {
    title: row.knowledge_documents?.title ?? "Unknown knowledge source",
    sourcePath: row.knowledge_documents?.source_path ?? "unknown",
  };
}

export function resolveKnowledgeRetrievalMode(preferredMode?: string): KnowledgeRetrievalMode {
  if (preferredMode === "baseline" || preferredMode === "tiered") {
    return preferredMode;
  }

  const envMode = process.env.BUSHEL_ADVISOR_RETRIEVAL_MODE;
  return envMode === "baseline" ? "baseline" : "tiered";
}

export function inferAdvisorKnowledgeTopics(messageText: string): string[] {
  return dedupe([...TIERED_DEFAULT_TOPICS, ...inferMessageTopicSignals(messageText)]);
}

export function buildTieredKnowledgeQueryPlan(messageText: string, grain: string): KnowledgeQueryPlanEntry[] {
  const explicitTopics = inferMessageTopicSignals(messageText);
  const topicTags = dedupe([...TIERED_DEFAULT_TOPICS, ...explicitTopics]);
  const queryPlan: KnowledgeQueryPlanEntry[] = [
    {
      id: "raw-question",
      label: "Raw question",
      query: compactWhitespace(messageText),
      limit: TIERED_CANDIDATE_LIMIT,
    },
    {
      id: "grain-context",
      label: "Expanded grain context",
      query: compactWhitespace([grain, "western canada", "prairie grain farmer", ...topicTags].join(" ")),
      limit: TIERED_CANDIDATE_LIMIT,
    },
  ];

  if (explicitTopics.includes("basis") || explicitTopics.includes("storage")) {
    queryPlan.push({
      id: "basis-storage-frameworks",
      label: "Basis and storage frameworks",
      query: compactWhitespace(`${grain} Basis Signal Matrix Storage Decision Algorithm basis storage carry pricing`),
      limit: TIERED_CANDIDATE_LIMIT,
    });
  }

  if (
    explicitTopics.includes("hedging") ||
    explicitTopics.includes("futures") ||
    explicitTopics.includes("options") ||
    explicitTopics.includes("contracts")
  ) {
    queryPlan.push({
      id: "hedging-contracts",
      label: "Hedging and contract selection",
      query: compactWhitespace(`${grain} Hedging Mechanics Option Strategies Contract Type Selection futures options basis contract`),
      limit: TIERED_CANDIDATE_LIMIT,
    });
  }

  if (explicitTopics.includes("cot") || /\bmanaged money\b|\bcommercials\b|\bspecs\b/i.test(messageText)) {
    queryPlan.push({
      id: "cot-positioning",
      label: "COT timing",
      query: compactWhitespace(`${grain} COT Integration Rule CFTC Positioning timing not direction managed money commercials`),
      limit: TIERED_CANDIDATE_LIMIT,
    });
  }

  if (explicitTopics.includes("logistics") || explicitTopics.includes("exports")) {
    queryPlan.push({
      id: "flow-logistics",
      label: "Logistics and export flow",
      query: compactWhitespace(`${grain} Export Demand Indicators Logistics Transport Awareness Regional Transport Cost haul deliveries exports`),
      limit: TIERED_CANDIDATE_LIMIT,
    });
  }

  if (explicitTopics.includes("seasonality")) {
    queryPlan.push({
      id: "seasonality-carry",
      label: "Seasonality and carry",
      query: compactWhitespace(`${grain} Seasonal Patterns Cyclical Tendencies Carry Trade Spread Analysis seasonal carry`),
      limit: TIERED_CANDIDATE_LIMIT,
    });
  }

  const seen = new Set<string>();
  return queryPlan.filter((entry) => {
    const key = normalizeText(entry.query);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildHeadingHints(topicTags: string[]): string[] {
  return dedupe(topicTags.flatMap((tag) => TOPIC_HEADING_HINTS[tag] ?? []));
}

export function selectTieredKnowledgeChunks(candidates: RetrievedKnowledgeChunk[], limit: number): RetrievedKnowledgeChunk[] {
  if (candidates.length === 0) {
    return [];
  }

  const selected: RetrievedKnowledgeChunk[] = [];
  const selectedIds = new Set<number>();
  const docCounts = new Map<number, number>();
  const docOrder = new Map<number, number>();

  const candidatesByDoc = new Map<number, RetrievedKnowledgeChunk[]>();
  for (const candidate of candidates) {
    const existing = candidatesByDoc.get(candidate.documentId) ?? [];
    existing.push(candidate);
    candidatesByDoc.set(candidate.documentId, existing);
  }

  const rankedDocs = [...candidatesByDoc.entries()]
    .map(([documentId, rows]) => ({
      documentId,
      rows: rows.sort(
        (a, b) =>
          compareNumbersDesc(a.score, b.score) ||
          compareNullableNumbersAsc(a.chunkIndex, b.chunkIndex) ||
          a.chunkId - b.chunkId,
      ),
    }))
    .sort((a, b) => compareNumbersDesc(a.rows[0]?.score ?? 0, b.rows[0]?.score ?? 0) || a.documentId - b.documentId);

  for (const { documentId, rows } of rankedDocs) {
    if (selected.length >= limit) break;
    const next = rows[0];
    if (!next) continue;
    selected.push(next);
    selectedIds.add(next.chunkId);
    docCounts.set(documentId, 1);
    docOrder.set(documentId, docOrder.size);
  }

  if (selected.length >= limit) {
    return selected.sort(
      (a, b) =>
        (docOrder.get(a.documentId) ?? 0) - (docOrder.get(b.documentId) ?? 0) ||
        compareNullableNumbersAsc(a.chunkIndex, b.chunkIndex) ||
        a.chunkId - b.chunkId,
    );
  }

  const remaining = candidates
    .filter((candidate) => !selectedIds.has(candidate.chunkId))
    .sort(
      (a, b) =>
        compareNumbersDesc(a.score, b.score) ||
        compareNullableNumbersAsc(a.chunkIndex, b.chunkIndex) ||
        a.chunkId - b.chunkId,
    );

  for (const candidate of remaining) {
    if (selected.length >= limit) break;
    const currentCount = docCounts.get(candidate.documentId) ?? 0;
    if (currentCount >= 2) continue;

    selected.push(candidate);
    selectedIds.add(candidate.chunkId);
    docCounts.set(candidate.documentId, currentCount + 1);
    if (!docOrder.has(candidate.documentId)) {
      docOrder.set(candidate.documentId, docOrder.size);
    }
  }

  return selected.sort(
    (a, b) =>
      (docOrder.get(a.documentId) ?? 0) - (docOrder.get(b.documentId) ?? 0) ||
      compareNullableNumbersAsc(a.chunkIndex, b.chunkIndex) ||
      a.chunkId - b.chunkId,
  );
}

async function runKnowledgeRpc(
  supabase: SupabaseClient,
  queryPlan: KnowledgeQueryPlanEntry[],
  grain: string,
  topicTags: string[],
): Promise<Array<RpcChunkRow & { matchedQueries: string[] }>> {
  const responses = await Promise.all(
    queryPlan.map(async (entry) => {
      const { data, error } = await supabase.rpc("get_knowledge_context", {
        p_query: entry.query,
        p_grain: grain,
        p_topics: topicTags,
        p_limit: entry.limit,
      });

      if (error) {
        throw new Error(`Knowledge retrieval failed for ${entry.id}: ${error.message}`);
      }

      return {
        entryId: entry.id,
        rows: (Array.isArray(data) ? data : []) as RpcChunkRow[],
      };
    }),
  );

  const byChunkId = new Map<number, RpcChunkRow & { matchedQueries: string[] }>();
  for (const response of responses) {
    for (const row of response.rows) {
      const existing = byChunkId.get(row.chunk_id);
      if (!existing) {
        byChunkId.set(row.chunk_id, {
          ...row,
          matchedQueries: [response.entryId],
        });
        continue;
      }

      byChunkId.set(row.chunk_id, {
        ...existing,
        rank: Math.max(existing.rank, row.rank),
        matchedQueries: dedupe([...existing.matchedQueries, response.entryId]),
      });
    }
  }

  return [...byChunkId.values()];
}

async function loadChunkDetails(
  supabase: SupabaseClient,
  chunkIds: number[],
): Promise<Map<number, ChunkDetailRow>> {
  if (chunkIds.length === 0) {
    return new Map<number, ChunkDetailRow>();
  }

  const { data, error } = await supabase
    .from("knowledge_chunks")
    .select(
      "id, document_id, chunk_index, heading, content, grain_tags, topic_tags, region_tags, source_priority, metadata, knowledge_documents!inner(title, source_path)",
    )
    .in("id", chunkIds);

  if (error) {
    throw new Error(`Failed to load knowledge chunk details: ${error.message}`);
  }

  const rows = (Array.isArray(data) ? data : []) as ChunkDetailRow[];
  return new Map<number, ChunkDetailRow>(rows.map((row) => [row.id, row]));
}

async function retrieveBaselineKnowledgeContext(
  supabase: SupabaseClient,
  messageText: string,
  grain: string,
): Promise<KnowledgeRetrievalResult> {
  const topicTags = [...BASELINE_TOPICS];
  const queryPlan: KnowledgeQueryPlanEntry[] = [
    {
      id: "baseline",
      label: "Current advisor RPC",
      query: compactWhitespace(messageText),
      limit: BASELINE_LIMIT,
    },
  ];

  const rows = await runKnowledgeRpc(supabase, queryPlan, grain, topicTags);
  const chunks = rows
    .sort((a, b) => compareNumbersDesc(a.rank, b.rank) || a.chunk_id - b.chunk_id)
    .slice(0, BASELINE_LIMIT)
    .map<RetrievedKnowledgeChunk>((row) => ({
      chunkId: row.chunk_id,
      documentId: row.document_id,
      chunkIndex: null,
      title: row.title,
      sourcePath: row.source_path,
      heading: row.heading,
      content: row.content,
      grainTags: row.grain_tags,
      topicTags: row.topic_tags,
      regionTags: row.region_tags,
      sourcePriority: row.source_priority,
      metadata: row.metadata,
      rank: row.rank,
      score: row.rank,
      matchedQueries: row.matchedQueries,
    }));

  return {
    mode: "baseline",
    grain,
    topicTags,
    queryPlan,
    sourcePaths: dedupe(chunks.map((chunk) => chunk.sourcePath)),
    contextText: chunks.length > 0 ? chunks.map(formatChunkForPrompt).join("\n\n") : null,
    chunks,
  };
}

async function retrieveTieredKnowledgeContext(
  supabase: SupabaseClient,
  messageText: string,
  grain: string,
): Promise<KnowledgeRetrievalResult> {
  const topicTags = inferAdvisorKnowledgeTopics(messageText);
  const queryPlan = buildTieredKnowledgeQueryPlan(messageText, grain);
  const rpcCandidates = await runKnowledgeRpc(supabase, queryPlan, grain, topicTags);
  const chunkDetails = await loadChunkDetails(
    supabase,
    rpcCandidates.map((candidate) => candidate.chunk_id),
  );
  const headingHints = buildHeadingHints(topicTags);
  const questionTokens = new Set(tokenize(messageText));

  const candidates = rpcCandidates
    .map<RetrievedKnowledgeChunk | null>((candidate) => {
      const detail = chunkDetails.get(candidate.chunk_id);
      if (!detail) return null;

      const { title, sourcePath } = getDocumentMeta(detail);
      const headingText = normalizeText(detail.heading ?? "");
      const headingHintMatches = headingHints.filter((hint) => headingText.includes(hint)).length;
      const contentTokens = new Set(tokenize(detail.content));
      const overlappingTokens = [...questionTokens].filter((token) => contentTokens.has(token)).length;
      const topicOverlap = detail.topic_tags.filter((tag) => topicTags.includes(tag)).length;
      const queryBonus = candidate.matchedQueries.reduce(
        (sum, queryId) => sum + (QUERY_MATCH_BONUSES[queryId] ?? 0),
        0,
      );
      const score =
        candidate.rank +
        (candidate.matchedQueries.length - 1) * 0.03 +
        queryBonus +
        headingHintMatches * 0.03 +
        topicOverlap * 0.015 +
        Math.min(overlappingTokens, 3) * 0.01 +
        detail.source_priority / 1000;

      return {
        chunkId: candidate.chunk_id,
        documentId: candidate.document_id,
        chunkIndex: detail.chunk_index,
        title,
        sourcePath,
        heading: detail.heading,
        content: detail.content,
        grainTags: detail.grain_tags,
        topicTags: detail.topic_tags,
        regionTags: detail.region_tags,
        sourcePriority: detail.source_priority,
        metadata: detail.metadata,
        rank: candidate.rank,
        score,
        matchedQueries: candidate.matchedQueries,
      };
    })
    .filter((candidate): candidate is RetrievedKnowledgeChunk => candidate !== null)
    .sort(
      (a, b) =>
        compareNumbersDesc(a.score, b.score) ||
        compareNullableNumbersAsc(a.chunkIndex, b.chunkIndex) ||
        a.chunkId - b.chunkId,
    );

  const chunks = selectTieredKnowledgeChunks(candidates, TIERED_MAX_LIMIT);

  return {
    mode: "tiered",
    grain,
    topicTags,
    queryPlan,
    sourcePaths: dedupe(chunks.map((chunk) => chunk.sourcePath)),
    contextText: chunks.length > 0 ? chunks.map(formatChunkForPrompt).join("\n\n") : null,
    chunks,
  };
}

export async function retrieveAdvisorKnowledgeContext(options: {
  messageText: string;
  grain: string;
  mode?: KnowledgeRetrievalMode;
  supabase?: SupabaseClient;
}): Promise<KnowledgeRetrievalResult> {
  const supabase = options.supabase ?? createAdminClient();
  const mode = resolveKnowledgeRetrievalMode(options.mode);

  if (mode === "baseline") {
    return retrieveBaselineKnowledgeContext(supabase, options.messageText, options.grain);
  }

  try {
    return await retrieveTieredKnowledgeContext(supabase, options.messageText, options.grain);
  } catch (error) {
    console.warn(`Tiered knowledge retrieval failed, falling back to baseline: ${String(error)}`);
    return retrieveBaselineKnowledgeContext(supabase, options.messageText, options.grain);
  }
}
