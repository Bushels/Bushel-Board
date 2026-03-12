#!/usr/bin/env npx tsx
/**
 * Distill the raw knowledge corpus with Step 3.5 Flash via OpenRouter.
 *
 * The script reads extracted source documents locally, sends packetized source
 * text to Step for compression, and writes stable markdown/json artifacts under
 * data/knowledge/distillations/. Those artifacts are then eligible for the
 * normal ingest-knowledge path.
 *
 * Usage:
 *   npm run distill-knowledge
 *   npm run distill-knowledge -- --limit 1 --match grain
 *   npm run distill-knowledge -- --dry-run
 *   npm run distill-knowledge -- --force
 *
 * Output: JSON summary to stdout, diagnostics to stderr.
 * Idempotent: skips unchanged sources when source_hash + prompt_version match.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { basename, extname, resolve } from "path";
import {
  buildChunks,
  ChunkRecord,
  collectKnowledgeFiles,
  DEFAULT_DISTILLATION_DIR,
  DEFAULT_RAW_KNOWLEDGE_DIR,
  getExtractionWarnings,
  loadDocument,
  loadEnvFile,
  normalizeText,
  sha256,
} from "./knowledge-lib";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "stepfun/step-3.5-flash:free";
const PROMPT_VERSION = "step-distillation-v1";
const MAX_PACKET_CHARS = 24000;
const MAX_PACKET_OUTPUT_TOKENS = 6000;
const MAX_FINAL_OUTPUT_TOKENS = 8000;

interface Packet {
  packetIndex: number;
  text: string;
}

interface PacketDistillation {
  packet_summary: string;
  farmer_takeaways: string[];
  market_heuristics: Array<{ title: string; body: string }>;
  risk_watchouts: string[];
  grain_tags: string[];
  topic_tags: string[];
  region_tags: string[];
  evidence_highlights: Array<{ source_locator: string; takeaway: string }>;
}

interface FinalDistillation {
  title: string;
  executive_summary: string;
  farmer_takeaways: string[];
  market_heuristics: Array<{ title: string; body: string }>;
  risk_watchouts: string[];
  grain_focus: string[];
  topic_tags: string[];
  region_tags: string[];
  evidence_highlights: Array<{ source_locator: string; takeaway: string }>;
}

function takeUniqueObjects<T>(items: T[], keyFn: (item: T) => string, limit: number): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const item of items) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }

  return result;
}

function truncateWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text.trim();
  return `${words.slice(0, maxWords).join(" ")}...`;
}

function consolidatePacketDistillations(
  title: string,
  packetDistillations: PacketDistillation[],
): FinalDistillation {
  const packetSummaries = packetDistillations
    .map((packet) => packet.packet_summary?.trim())
    .filter(Boolean) as string[];

  return {
    title,
    executive_summary: truncateWords(packetSummaries.slice(0, 3).join(" "), 180),
    farmer_takeaways: dedupe(packetDistillations.flatMap((packet) => packet.farmer_takeaways ?? [])).slice(0, 8),
    market_heuristics: takeUniqueObjects(
      packetDistillations.flatMap((packet) => packet.market_heuristics ?? []),
      (item) => `${item.title}::${item.body}`,
      8,
    ),
    risk_watchouts: dedupe(packetDistillations.flatMap((packet) => packet.risk_watchouts ?? [])).slice(0, 8),
    grain_focus: dedupe(packetDistillations.flatMap((packet) => packet.grain_tags ?? [])).slice(0, 8),
    topic_tags: dedupe(packetDistillations.flatMap((packet) => packet.topic_tags ?? [])).slice(0, 12),
    region_tags: dedupe(packetDistillations.flatMap((packet) => packet.region_tags ?? [])).slice(0, 12),
    evidence_highlights: takeUniqueObjects(
      packetDistillations.flatMap((packet) => packet.evidence_highlights ?? []),
      (item) => `${item.source_locator}::${item.takeaway}`,
      12,
    ),
  };
}

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.error(`
Knowledge Distillation Script - Compress the source corpus with Step 3.5 Flash

Usage:
  npm run distill-knowledge                                Distill all raw knowledge files
  npm run distill-knowledge -- --dry-run                   Extract + packetize only, do not call Step
  npm run distill-knowledge -- --limit <n>                 Process only the first n files
  npm run distill-knowledge -- --match <text>              Filter source paths by substring
  npm run distill-knowledge -- --dir <path>                Override the raw knowledge directory
  npm run distill-knowledge -- --include-framework         Include docs/reference framework as a source
  npm run distill-knowledge -- --allow-low-yield           Process sources with weak text extraction warnings
  npm run distill-knowledge -- --enable-local-ocr          Run local OCR before classifying weak PDFs (slow)
  npm run distill-knowledge -- --skip-low-yield-rescue     Skip PDF rescue and leave weak PDFs excluded
  npm run distill-knowledge -- --force                     Regenerate even if source hash has not changed
  npm run distill-knowledge -- --help                      Show this help

Environment variables (from .env.local):
  OPENROUTER_API_KEY            OpenRouter key for Step 3.5 Flash
  BUSHEL_KNOWLEDGE_ENABLE_OCR   Enable local OCR for weak scanned PDFs

Artifacts:
  data/knowledge/distillations/*.distilled.md
  data/knowledge/distillations/*.distilled.json
`);
  process.exit(0);
}

const DRY_RUN = args.includes("--dry-run");
const FORCE = args.includes("--force");
const INCLUDE_FRAMEWORK = args.includes("--include-framework");
const ALLOW_LOW_YIELD = args.includes("--allow-low-yield");
const RESCUE_LOW_YIELD = !args.includes("--skip-low-yield-rescue");
const ENABLE_LOCAL_OCR = args.includes("--enable-local-ocr");
const dirArgIndex = args.indexOf("--dir");
const limitArgIndex = args.indexOf("--limit");
const matchArgIndex = args.indexOf("--match");
const directoryOverride = dirArgIndex !== -1 ? args[dirArgIndex + 1] : null;
const documentLimit = limitArgIndex !== -1 ? Number(args[limitArgIndex + 1]) : null;
const matchFilter = matchArgIndex !== -1 ? args[matchArgIndex + 1]?.toLowerCase() : null;

if (documentLimit !== null && (!Number.isInteger(documentLimit) || documentLimit <= 0)) {
  console.error("ERROR: --limit must be a positive integer");
  process.exit(1);
}

loadEnvFile(resolve(__dirname, "../.env.local"));

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const KNOWLEDGE_DIR = directoryOverride ? resolve(directoryOverride) : DEFAULT_RAW_KNOWLEDGE_DIR;

if (ENABLE_LOCAL_OCR) {
  process.env.BUSHEL_KNOWLEDGE_ENABLE_OCR = "1";
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

function dedupe(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim())).map((value) => value.trim()))];
}

function buildSourceLocator(chunk: ChunkRecord): string {
  const section = chunk.metadata.section;
  const pageStart = chunk.metadata.page_start;
  const pageEnd = chunk.metadata.page_end;
  const parts: string[] = [];

  if (typeof section === "string" && section.length > 0) {
    parts.push(`section: ${section}`);
  }

  if (typeof pageStart === "number" && typeof pageEnd === "number") {
    parts.push(pageStart === pageEnd ? `page ${pageStart}` : `pages ${pageStart}-${pageEnd}`);
  } else if (typeof pageStart === "number") {
    parts.push(`page ${pageStart}`);
  }

  return parts.length > 0 ? parts.join(", ") : "locator unavailable";
}

function buildPackets(chunks: ChunkRecord[]): Packet[] {
  const packets: Packet[] = [];
  let currentLines: string[] = [];
  let currentLength = 0;

  function flush() {
    if (currentLines.length === 0) return;
    packets.push({
      packetIndex: packets.length + 1,
      text: currentLines.join("\n\n"),
    });
    currentLines = [];
    currentLength = 0;
  }

  for (const chunk of chunks) {
    const packetChunk = [
      `Source locator: ${buildSourceLocator(chunk)}`,
      chunk.heading ? `Heading: ${chunk.heading}` : null,
      chunk.content,
    ].filter(Boolean).join("\n");

    if (currentLength + packetChunk.length > MAX_PACKET_CHARS && currentLines.length > 0) {
      flush();
    }

    currentLines.push(packetChunk);
    currentLength += packetChunk.length + 2;
  }

  flush();
  return packets;
}

function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("Model response did not contain a JSON object");
  }

  return trimmed.slice(firstBrace, lastBrace + 1);
}

async function callStep(prompt: string, maxTokens: number) {
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "HTTP-Referer": "https://bushelboard.ca",
      "X-Title": "Bushel Board Knowledge Distiller",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "You distill commodity and grain marketing source material for western Canadian prairie farmers. Return only valid JSON with no markdown wrapper. Preserve nuance, do not invent facts, and prefer practical marketing implications over academic trivia.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenRouter ${response.status}: ${errText.slice(0, 300)}`);
  }

  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content ?? "";
  const usage = payload.usage ?? {};

  return {
    jsonText: extractJsonObject(content),
    usage: {
      prompt_tokens: usage.prompt_tokens ?? null,
      completion_tokens: usage.completion_tokens ?? null,
      total_tokens: usage.total_tokens ?? null,
    },
  };
}

async function callStepWithPdfRescue(
  filePath: string,
  prompt: string,
  maxTokens: number,
): Promise<{
  jsonText: string;
  usage: { prompt_tokens: number | null; completion_tokens: number | null; total_tokens: number | null };
  engine: string;
}> {
  const fileBytes = readFileSync(filePath);
  const fileData = `data:application/pdf;base64,${fileBytes.toString("base64")}`;
  const engines = ["pdf-text", "mistral-ocr"];
  let lastError: Error | null = null;

  for (const engine of engines) {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://bushelboard.ca",
        "X-Title": "Bushel Board Knowledge Distiller",
      },
      body: JSON.stringify({
        model: MODEL,
        plugins: [
          {
            id: "file-parser",
            pdf: {
              engine,
            },
          },
        ],
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "file",
                file: {
                  filename: basename(filePath),
                  file_data: fileData,
                },
              },
            ],
          },
        ],
        response_format: { type: "json_object" },
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      lastError = new Error(`OpenRouter PDF rescue (${engine}) ${response.status}: ${errText.slice(0, 300)}`);
      continue;
    }

    const payload = await response.json();
    const content = payload.choices?.[0]?.message?.content ?? "";
    const usage = payload.usage ?? {};

    return {
      jsonText: extractJsonObject(content),
      usage: {
        prompt_tokens: usage.prompt_tokens ?? null,
        completion_tokens: usage.completion_tokens ?? null,
        total_tokens: usage.total_tokens ?? null,
      },
      engine,
    };
  }

  throw lastError ?? new Error("OpenRouter PDF rescue failed for all configured engines");
}

function buildPacketPrompt(source: {
  title: string;
  sourcePath: string;
  packetIndex: number;
  packetCount: number;
  packetText: string;
}) {
  return `Distill this source packet into practical grain-marketing knowledge for western Canadian prairie farmers.

Source title: ${source.title}
Source path: ${source.sourcePath}
Packet: ${source.packetIndex} of ${source.packetCount}

Return a JSON object with this exact shape:
{
  "packet_summary": "string",
  "farmer_takeaways": ["string"],
  "market_heuristics": [{"title": "string", "body": "string"}],
  "risk_watchouts": ["string"],
  "grain_tags": ["string"],
  "topic_tags": ["string"],
  "region_tags": ["string"],
  "evidence_highlights": [{"source_locator": "string", "takeaway": "string"}]
}

Rules:
- Focus on basis, storage, hedging, price discovery, logistics, demand, seasonality, and farmer decision-making.
- Translate academic or historical material into farmer-usable language.
- Keep arrays concise and high-signal.
- Do not mention packet numbers in the output.
- Do not invent citations. Use only source locators present in the packet.

Source packet:
${source.packetText}`;
}

function buildPdfRescuePrompt(source: {
  title: string;
  sourcePath: string;
}) {
  return `You are reading a PDF source file for Bushel Board using OCR-assisted parsing.

Source title: ${source.title}
Source path: ${source.sourcePath}

Return a JSON object with this exact shape:
{
  "title": "string",
  "executive_summary": "string",
  "farmer_takeaways": ["string"],
  "market_heuristics": [{"title": "string", "body": "string"}],
  "risk_watchouts": ["string"],
  "grain_focus": ["string"],
  "topic_tags": ["string"],
  "region_tags": ["string"],
  "evidence_highlights": [{"source_locator": "string", "takeaway": "string"}]
}

Rules:
- This source had weak local text extraction, so rely on the parsed PDF attached to this request.
- Focus on basis, storage, hedging, futures structure, logistics, demand, and farmer decision-making.
- If the source is broad, keep only the parts that would improve Bushel Board for a prairie grain farmer.
- Keep the executive summary under 180 words.
- Use chapter names, section names, or page references when available in evidence_highlights.
- Return JSON only.`;
}

function renderMarkdown(options: {
  final: FinalDistillation;
  sourceTitle: string;
  sourcePath: string;
  sourceHash: string;
  packetCount: number;
  warnings: string[];
}) {
  const { final } = options;
  const lines: string[] = [
    `# Distilled Grain Knowledge - ${final.title || options.sourceTitle}`,
    "",
    `Source Title: ${options.sourceTitle}`,
    `Source Path: ${options.sourcePath}`,
    `Source Hash: ${options.sourceHash}`,
    `Model Used: ${MODEL}`,
    `Prompt Version: ${PROMPT_VERSION}`,
    `Generated At: ${new Date().toISOString()}`,
    `Packet Count: ${options.packetCount}`,
    `Extraction Warnings: ${options.warnings.length > 0 ? options.warnings.join(", ") : "none"}`,
    "",
    "## Executive Summary",
    final.executive_summary,
    "",
    "## Farmer Takeaways",
    ...final.farmer_takeaways.map((item) => `- ${item}`),
    "",
    "## Market Heuristics",
    ...final.market_heuristics.flatMap((heuristic) => [`### ${heuristic.title}`, heuristic.body, ""]),
    "## Risk Watchouts",
    ...final.risk_watchouts.map((item) => `- ${item}`),
    "",
    "## Grain Focus",
    ...final.grain_focus.map((item) => `- ${item}`),
    "",
    "## Retrieval Tags",
    `- Topic Tags: ${final.topic_tags.join(", ") || "none"}`,
    `- Region Tags: ${final.region_tags.join(", ") || "none"}`,
    "",
    "## Evidence Highlights",
    ...final.evidence_highlights.map((item) => `- [${item.source_locator}] ${item.takeaway}`),
    "",
  ];

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

async function distillKnowledge() {
  const files = await collectKnowledgeFiles({
    rawDirectory: KNOWLEDGE_DIR,
    includeSeedDocs: INCLUDE_FRAMEWORK,
    includeDistillations: false,
  });
  const filteredFiles = files.filter((filePath) =>
    !matchFilter || filePath.toLowerCase().includes(matchFilter)
  );
  const selectedFiles = documentLimit ? filteredFiles.slice(0, documentLimit) : filteredFiles;

  if (!DRY_RUN && !OPENROUTER_API_KEY) {
    console.error("ERROR: OPENROUTER_API_KEY must be set.");
    process.exit(1);
  }

  mkdirSync(DEFAULT_DISTILLATION_DIR, { recursive: true });

  const startTime = Date.now();
  let docsScanned = 0;
  let docsGenerated = 0;
  let docsSkipped = 0;
  const summaries: Array<Record<string, unknown>> = [];

  for (const filePath of selectedFiles) {
    docsScanned += 1;
    console.error(`Distilling ${basename(filePath)}...`);

    const document = await loadDocument(filePath);
    if (!document) {
      docsSkipped += 1;
      summaries.push({
        source_path: filePath,
        status: "skipped",
        reason: "empty_or_unsupported",
        extraction_method: null,
        ocr_used: false,
        ocr_page_count: 0,
      });
      continue;
    }

    const normalizedText = normalizeText(document.rawText);
    const sourceHash = sha256(normalizedText);
    const chunks = buildChunks({ ...document, rawText: normalizedText });
    const warnings = getExtractionWarnings(document, normalizedText, chunks);
    const isLowYieldPdf =
      warnings.includes("low_text_yield_for_source_size") &&
      extname(filePath).toLowerCase() === ".pdf";
    const shouldRescueLowYield = RESCUE_LOW_YIELD && isLowYieldPdf;

    if (!ALLOW_LOW_YIELD && warnings.includes("low_text_yield_for_source_size") && !shouldRescueLowYield) {
      docsSkipped += 1;
      summaries.push({
        source_path: document.sourcePath,
        status: "skipped_low_yield",
        chunk_count: chunks.length,
        warnings,
        extraction_method: document.metadata.extraction_method ?? null,
        ocr_used: document.metadata.ocr_used ?? false,
        ocr_page_count: document.metadata.ocr_page_count ?? 0,
      });
      continue;
    }

    const slug = slugify(document.sourcePath.replace(/^data\//, "").replace(extname(document.sourcePath), ""));
    const markdownPath = resolve(DEFAULT_DISTILLATION_DIR, `${slug}.distilled.md`);
    const metadataPath = resolve(DEFAULT_DISTILLATION_DIR, `${slug}.distilled.json`);

    if (!FORCE && existsSync(metadataPath)) {
      try {
        const existing = JSON.parse(readFileSync(metadataPath, "utf-8")) as {
          source_hash?: string;
          prompt_version?: string;
        };

        if (existing.source_hash === sourceHash && existing.prompt_version === PROMPT_VERSION) {
          docsSkipped += 1;
          summaries.push({
            source_path: document.sourcePath,
            status: "unchanged",
            chunk_count: chunks.length,
            warnings,
            extraction_method: document.metadata.extraction_method ?? null,
            ocr_used: document.metadata.ocr_used ?? false,
            ocr_page_count: document.metadata.ocr_page_count ?? 0,
          });
          continue;
        }
      } catch {
        // Regenerate on invalid metadata files.
      }
    }

    const packets = buildPackets(chunks);

    if (DRY_RUN) {
      docsGenerated += 1;
      summaries.push({
        source_path: document.sourcePath,
        status: shouldRescueLowYield ? "dry_run_pdf_rescue" : "dry_run",
        chunk_count: chunks.length,
        packet_count: shouldRescueLowYield ? 0 : packets.length,
        distillation_mode: shouldRescueLowYield ? "pdf_file_parser" : "chunk_packets",
        warnings,
        extraction_method: document.metadata.extraction_method ?? null,
        ocr_used: document.metadata.ocr_used ?? false,
        ocr_page_count: document.metadata.ocr_page_count ?? 0,
      });
      continue;
    }

    let promptTokens = 0;
    let completionTokens = 0;
    const distillationMode = shouldRescueLowYield ? "pdf_file_parser" : "chunk_packets";
    let pdfRescueEngine: string | null = null;
    let finalDistillation: FinalDistillation;

    if (shouldRescueLowYield) {
      console.error("  Using PDF rescue mode via OpenRouter file parser + Step");
      const rescueResponse = await callStepWithPdfRescue(
        filePath,
        buildPdfRescuePrompt({
          title: document.title,
          sourcePath: document.sourcePath,
        }),
        MAX_FINAL_OUTPUT_TOKENS,
      );

      promptTokens += rescueResponse.usage.prompt_tokens ?? 0;
      completionTokens += rescueResponse.usage.completion_tokens ?? 0;
      pdfRescueEngine = rescueResponse.engine;
      finalDistillation = JSON.parse(rescueResponse.jsonText) as FinalDistillation;
    } else {
      const packetDistillations: PacketDistillation[] = [];

      for (const packet of packets) {
        console.error(`  Packet ${packet.packetIndex}/${packets.length}`);
        const { jsonText, usage } = await callStep(
          buildPacketPrompt({
            title: document.title,
            sourcePath: document.sourcePath,
            packetIndex: packet.packetIndex,
            packetCount: packets.length,
            packetText: packet.text,
          }),
          MAX_PACKET_OUTPUT_TOKENS,
        );

        packetDistillations.push(JSON.parse(jsonText) as PacketDistillation);
        promptTokens += usage.prompt_tokens ?? 0;
        completionTokens += usage.completion_tokens ?? 0;
      }
      finalDistillation = consolidatePacketDistillations(document.title, packetDistillations);
    }
    const normalizedFinal: FinalDistillation = {
      title: finalDistillation.title || document.title,
      executive_summary: finalDistillation.executive_summary || "",
      farmer_takeaways: dedupe(finalDistillation.farmer_takeaways ?? []).slice(0, 8),
      market_heuristics: (finalDistillation.market_heuristics ?? []).slice(0, 8),
      risk_watchouts: dedupe(finalDistillation.risk_watchouts ?? []).slice(0, 8),
      grain_focus: dedupe(finalDistillation.grain_focus ?? []).slice(0, 8),
      topic_tags: dedupe(finalDistillation.topic_tags ?? []).slice(0, 12),
      region_tags: dedupe(finalDistillation.region_tags ?? []).slice(0, 12),
      evidence_highlights: (finalDistillation.evidence_highlights ?? []).slice(0, 12),
    };

    writeFileSync(
      markdownPath,
      renderMarkdown({
        final: normalizedFinal,
        sourceTitle: document.title,
        sourcePath: document.sourcePath,
        sourceHash,
        packetCount: packets.length,
        warnings,
      }),
      "utf-8",
    );

    writeFileSync(
      metadataPath,
      JSON.stringify({
        source_path: document.sourcePath,
        source_title: document.title,
        source_hash: sourceHash,
        prompt_version: PROMPT_VERSION,
        model_used: MODEL,
        source_metadata: document.metadata,
        packet_count: packets.length,
        distillation_mode: distillationMode,
        pdf_rescue_engine: pdfRescueEngine,
        warnings,
        generated_at: new Date().toISOString(),
        output_markdown_path: markdownPath.replaceAll("\\", "/"),
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens,
        },
      }, null, 2),
      "utf-8",
    );

    docsGenerated += 1;
    summaries.push({
      source_path: document.sourcePath,
      status: "generated",
      chunk_count: chunks.length,
      packet_count: packets.length,
      distillation_mode: distillationMode,
      pdf_rescue_engine: pdfRescueEngine,
      extraction_method: document.metadata.extraction_method ?? null,
      ocr_used: document.metadata.ocr_used ?? false,
      ocr_page_count: document.metadata.ocr_page_count ?? 0,
      output_markdown: markdownPath.replaceAll("\\", "/"),
      warnings,
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      },
    });
  }

  console.log(JSON.stringify({
    dry_run: DRY_RUN,
    local_ocr_enabled: ENABLE_LOCAL_OCR,
    docs_scanned: docsScanned,
    docs_generated: docsGenerated,
    docs_skipped: docsSkipped,
    duration_ms: Date.now() - startTime,
    sources: summaries,
  }, null, 2));
}

distillKnowledge().catch((error) => {
  console.error(`Fatal error: ${String(error)}`);
  process.exit(1);
});
