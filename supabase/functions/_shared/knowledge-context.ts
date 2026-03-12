export type KnowledgeTask = "analyze" | "intelligence" | "farm_summary";

interface KnowledgeChunkRow {
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

export interface KnowledgeContextResult {
  contextText: string | null;
  chunkIds: number[];
  documentIds: number[];
  sourcePaths: string[];
  topicTags: string[];
  query: string;
}

const TASK_TOPIC_DEFAULTS: Record<KnowledgeTask, string[]> = {
  analyze: [
    "deliveries",
    "exports",
    "stocks",
    "storage",
    "basis",
    "seasonality",
    "hedging",
    "logistics",
    "crush",
  ],
  intelligence: [
    "deliveries",
    "exports",
    "stocks",
    "basis",
    "storage",
    "hedging",
    "policy",
    "logistics",
    "demand",
  ],
  farm_summary: [
    "farmer_marketing",
    "cash_sales",
    "basis",
    "storage",
    "hedging",
    "seasonality",
  ],
};

const INFERRED_TOPIC_PATTERNS: Array<{ tag: string; pattern: RegExp }> = [
  { tag: "basis", pattern: /\bbasis\b/i },
  { tag: "hedging", pattern: /\bhedg(e|ing|ed)\b/i },
  { tag: "futures", pattern: /\bfutures?\b/i },
  { tag: "options", pattern: /\boptions?\b/i },
  { tag: "storage", pattern: /\bstor(age|e)\b|\bbin(s)?\b/i },
  { tag: "deliveries", pattern: /\bdeliver(y|ies)\b|\bfarmer selling\b/i },
  { tag: "exports", pattern: /\bexport(s|ed|ing)?\b/i },
  { tag: "stocks", pattern: /\bstock(s|pile)?\b|\binventor(y|ies)\b/i },
  { tag: "logistics", pattern: /\brail\b|\bport\b|\bterminal\b|\blogistics\b|\bcongestion\b/i },
  { tag: "crush", pattern: /\bcrush\b|\bprocessing\b|\bprocessor(s)?\b/i },
  { tag: "seasonality", pattern: /\bseason(al|ality)?\b|\bharvest\b|\bseeding\b/i },
  { tag: "policy", pattern: /\btariff(s)?\b|\bpolicy\b|\btrade\b|\bregulation(s)?\b/i },
  { tag: "demand", pattern: /\bdemand\b|\bconsumption\b|\bbuyer(s)?\b/i },
  { tag: "cash_sales", pattern: /\bcash sale(s)?\b|\bspot sale(s)?\b/i },
  { tag: "farmer_marketing", pattern: /\bmarketing\b|\bpriced\b|\bpricing\b/i },
];

function dedupe(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim())).map((value) => value.trim()))];
}

function inferTopicTags(text: string): string[] {
  return INFERRED_TOPIC_PATTERNS
    .filter(({ pattern }) => pattern.test(text))
    .map(({ tag }) => tag);
}

function buildKnowledgeQuery(grain: string, task: KnowledgeTask, extraTerms: string[] = []): string {
  const terms = dedupe([
    grain,
    "western canada",
    "prairie grain farmer",
    ...TASK_TOPIC_DEFAULTS[task],
    ...extraTerms,
  ]);

  return terms.join(" ");
}

function formatChunk(chunk: KnowledgeChunkRow): string {
  const metaParts: string[] = [];
  const pageStart = chunk.metadata?.page_start;
  const pageEnd = chunk.metadata?.page_end;
  const section = chunk.metadata?.section;

  if (typeof section === "string" && section.length > 0) {
    metaParts.push(`section: ${section}`);
  }

  if (typeof pageStart === "number" && typeof pageEnd === "number") {
    metaParts.push(pageStart === pageEnd ? `page: ${pageStart}` : `pages: ${pageStart}-${pageEnd}`);
  } else if (typeof pageStart === "number") {
    metaParts.push(`page: ${pageStart}`);
  }

  const header = [chunk.title, chunk.heading].filter(Boolean).join(" - ");
  const sourceLine = `Source: ${chunk.source_path}${metaParts.length ? ` | ${metaParts.join(" | ")}` : ""}`;

  return `### ${header}\n${sourceLine}\n${chunk.content}`;
}

export async function fetchKnowledgeContext(
  supabase: {
    rpc: (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  },
  options: {
    grain: string;
    task: KnowledgeTask;
    extraTerms?: string[];
    limit?: number;
  },
): Promise<KnowledgeContextResult> {
  const topicTags = dedupe([
    ...TASK_TOPIC_DEFAULTS[options.task],
    ...inferTopicTags(options.extraTerms?.join(" ") ?? ""),
  ]);
  const query = buildKnowledgeQuery(options.grain, options.task, options.extraTerms);

  const { data, error } = await supabase.rpc("get_knowledge_context", {
    p_query: query,
    p_grain: options.grain,
    p_topics: topicTags,
    p_limit: options.limit ?? 6,
  });

  if (error) {
    console.warn(`Knowledge retrieval failed for ${options.grain}: ${error.message}`);
    return {
      contextText: null,
      chunkIds: [],
      documentIds: [],
      sourcePaths: [],
      topicTags,
      query,
    };
  }

  const chunks = (Array.isArray(data) ? data : []) as KnowledgeChunkRow[];
  if (chunks.length === 0) {
    return {
      contextText: null,
      chunkIds: [],
      documentIds: [],
      sourcePaths: [],
      topicTags,
      query,
    };
  }

  return {
    contextText: chunks.map(formatChunk).join("\n\n"),
    chunkIds: chunks.map((chunk) => chunk.chunk_id),
    documentIds: chunks.map((chunk) => chunk.document_id),
    sourcePaths: dedupe(chunks.map((chunk) => chunk.source_path)),
    topicTags,
    query,
  };
}
