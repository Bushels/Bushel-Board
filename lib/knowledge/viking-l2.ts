/**
 * Viking L2 — Fine-grained chunk retrieval from distilled knowledge books.
 *
 * The real L2 content lives in the `.distilled.md` companion files.
 * These markdown files contain high-signal sections:
 *   - Evidence Highlights (with page numbers)
 *   - Market Heuristics
 *   - Farmer Takeaways
 *   - Risk Watchouts
 *   - Retrieval Tags
 *
 * This module parses those files and returns relevant, citable excerpts.
 */

import { existsSync, readFileSync, readdirSync } from "fs";
import { homedir } from "os";
import { resolve } from "path";

export type VikingL2Topic =
  | "basis_pricing"
  | "storage_carry"
  | "hedging_contracts"
  | "logistics_exports"
  | "market_structure"
  | "risk_management"
  | "grain_specifics"
  | "wasde_revisions"
  | "crop_progress_signals"
  | "export_sales_pace"
  | "cot_positioning";

export interface VikingL2Chunk {
  id: string;
  source: string;
  topic: string;
  grain?: string;
  text: string;
  relevanceScore?: number;
  pageHint?: string;
}

export interface VikingL2Query {
  topics?: VikingL2Topic[];
  grain?: string;
  keywords?: string[];
  maxChunks?: number;
}

const DEFAULT_KNOWLEDGE_HOME = resolve(homedir(), ".bushel-board", "Knowledge");
const DISTILLATIONS_DIR = "distillations";

let cachedMarkdownSources: Array<{ source: string; content: string }> | null = null;
let cachedDistilledChunks: VikingL2Chunk[] | null = null;

function isVikingL2Enabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.BUSHEL_ENABLE_LOCAL_VIKING_L2 === "true";
}

/** Resolve the local knowledge root (honors BUSHEL_KNOWLEDGE_HOME). */
export function resolveVikingKnowledgeHome(): string {
  const envPath = process.env.BUSHEL_KNOWLEDGE_HOME;
  return envPath ? resolve(envPath) : DEFAULT_KNOWLEDGE_HOME;
}

/** Load all .distilled.md files as raw text */
function loadAllDistilledMarkdown(): Array<{ source: string; content: string }> {
  if (cachedMarkdownSources) return cachedMarkdownSources;

  const home = resolveVikingKnowledgeHome();
  const distDir = resolve(home, DISTILLATIONS_DIR);
  const results: Array<{ source: string; content: string }> = [];

  let files: string[];
  try {
    if (!existsSync(distDir)) {
      cachedMarkdownSources = [];
      return cachedMarkdownSources;
    }
    files = readdirSync(distDir).filter((f) => f.endsWith(".distilled.md"));
  } catch {
    cachedMarkdownSources = [];
    return cachedMarkdownSources;
  }

  for (const file of files) {
    try {
      const fullPath = resolve(distDir, file);
      const content = readFileSync(fullPath, "utf-8");
      // Extract source title from the markdown header
      const titleMatch = content.match(/Source Title:\s*(.+)/);
      const source = titleMatch ? titleMatch[1].trim() : file.replace(".distilled.md", "");
      results.push({ source, content });
    } catch {
      // Local-only knowledge is optional on deployed builds. Skip unreadable files
      // instead of turning the thesis board into a logging/noise source.
    }
  }

  cachedMarkdownSources = results;
  return cachedMarkdownSources;
}

function sectionText(content: string, heading: string): string | null {
  const match = content.match(new RegExp(`## ${heading}([\\s\\S]*?)(?=\\n##|$)`, "i"));
  return match?.[1]?.trim() || null;
}

function topicForText(text: string): VikingL2Topic {
  const lower = text.toLowerCase();
  if (lower.includes("wasde") || lower.includes("stocks-to-use") || lower.includes("stocks/use")) {
    return "wasde_revisions";
  }
  if (lower.includes("crop progress") || lower.includes("planting") || lower.includes("yield")) {
    return "crop_progress_signals";
  }
  if (lower.includes("export") || lower.includes("logistics") || lower.includes("transport")) {
    return "export_sales_pace";
  }
  if (lower.includes("managed money") || lower.includes("open interest") || lower.includes("cot")) {
    return "cot_positioning";
  }
  if (lower.includes("basis")) return "basis_pricing";
  if (lower.includes("storage") || lower.includes("carry")) return "storage_carry";
  if (lower.includes("hedge") || lower.includes("contract")) return "hedging_contracts";
  if (lower.includes("risk")) return "risk_management";
  return "grain_specifics";
}

/** Extract high-value sections from a distilled markdown file */
function extractHighValueSections(content: string): VikingL2Chunk[] {
  const chunks: VikingL2Chunk[] = [];

  const evidenceSection = sectionText(content, "Evidence Highlights");
  if (evidenceSection) {
    const evidenceLines = evidenceSection
      .split(/\r?\n/)
      .map((line) => line.replace(/^-\s*/, "").trim())
      .filter(Boolean);
    for (const line of evidenceLines) {
      const pageMatch = line.match(/\((Pages? [^)]+)\)/i);
      chunks.push({
        id: `evidence-${chunks.length}`,
        source: "",
        topic: topicForText(line),
        text: line,
        pageHint: pageMatch?.[1],
      });
    }
  }

  // Legacy packet shape with [page N] markers.
  const evidenceRegex = /\[page\s*(\d+)\]\s*([\s\S]+?)(?=\n-\s*\[page|\n##|$)/gi;
  let match;
  while ((match = evidenceRegex.exec(content)) !== null) {
    chunks.push({
      id: `evidence-${chunks.length}`,
      source: "",
      topic: topicForText(match[2]),
      text: match[2].trim(),
      pageHint: `page ${match[1]}`,
    });
  }

  // Market Heuristics section
  const heuristicsText = sectionText(content, "Market Heuristics");
  if (heuristicsText) {
    const heuristicBlocks = heuristicsText
      .split(/\n###\s+/)
      .map((block) => block.trim())
      .filter(Boolean);
    for (const block of heuristicBlocks) {
      chunks.push({
        id: `heuristics-${chunks.length}`,
        source: "",
        topic: topicForText(block),
        text: block.slice(0, 1200),
      });
    }
  }

  // Risk Watchouts
  const riskText = sectionText(content, "Risk Watchouts");
  if (riskText) {
    const riskLines = riskText
      .split(/\r?\n/)
      .map((line) => line.replace(/^-\s*/, "").trim())
      .filter(Boolean);
    for (const line of riskLines) {
      chunks.push({
        id: `risk-${chunks.length}`,
        source: "",
        topic: topicForText(line),
        text: line.slice(0, 1000),
      });
    }
  }

  return chunks;
}

function loadAllDistilledChunks(): VikingL2Chunk[] {
  if (cachedDistilledChunks) return cachedDistilledChunks;

  const sources = loadAllDistilledMarkdown();
  const chunks: VikingL2Chunk[] = [];

  for (const { source, content } of sources) {
    for (const section of extractHighValueSections(content)) {
      chunks.push({ ...section, source });
    }
  }

  cachedDistilledChunks = chunks;
  return cachedDistilledChunks;
}

/** Main L2 retrieval function. Disabled by default and unavailable in production. */
export async function getVikingL2Context(query: VikingL2Query): Promise<VikingL2Chunk[]> {
  if (!isVikingL2Enabled()) return [];

  const maxChunks = query.maxChunks ?? 6;
  const sections = loadAllDistilledChunks();

  if (sections.length === 0) return [];

  const results: VikingL2Chunk[] = [];
  const searchTerms = [
    ...(query.topics ?? []).flatMap((topic) => [topic, topic.replaceAll("_", " ")]),
    ...(query.keywords ?? []),
    query.grain,
  ]
    .filter(Boolean)
    .map((t) => t!.toLowerCase());
  const topicTerms = new Set((query.topics ?? []).map((topic) => topic.toLowerCase()));

  for (const section of sections) {
    const lowerText = section.text.toLowerCase();
    let score = 0;

    if (topicTerms.has(section.topic.toLowerCase())) score += 2.5;

    for (const term of searchTerms) {
      if (lowerText.includes(term)) score += 1.5;
    }

    // Boost if grain appears in the text
    if (query.grain && lowerText.includes(query.grain.toLowerCase())) score += 1;

    if (score > 0 || searchTerms.length === 0) {
      results.push({
        ...section,
        relevanceScore: score || 1,
      });
    }
  }

  // Sort by relevance and return top N
  return results
    .sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0))
    .slice(0, maxChunks);
}

/** Convenience helper that returns a ready-to-inject prompt block */
export async function getVikingL2PromptBlock(query: VikingL2Query): Promise<string> {
  const chunks = await getVikingL2Context(query);
  if (chunks.length === 0) return "";

  let block = "## Viking L2 — Specific Excerpts from Distilled Knowledge\n\n";

  chunks.forEach((c, i) => {
    const sourceLine = c.source ? `(${c.source})` : "";
    const pageLine = c.pageHint ? `[${c.pageHint}]` : "";
    block += `${i + 1}. ${sourceLine} ${pageLine}\n${c.text}\n\n`;
  });

  return block.trim();
}
