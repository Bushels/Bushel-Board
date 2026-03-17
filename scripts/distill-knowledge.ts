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

import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "fs";
import { spawnSync } from "child_process";
import { basename, extname, resolve } from "path";
import {
  buildChunks,
  ChunkRecord,
  collectKnowledgeFiles,
  DEFAULT_DISTILLATION_DIR,
  DEFAULT_KNOWLEDGE_HOME,
  DEFAULT_KNOWLEDGE_TMP_DIR,
  DEFAULT_RAW_KNOWLEDGE_DIR,
  getExtractionWarnings,
  loadDocument,
  loadEnvFile,
  normalizeText,
  sha256,
} from "./knowledge-lib";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "stepfun/step-3.5-flash:free";
const DEFAULT_VISION_MODEL = "google/gemma-3-27b-it:free";
const VISION_FALLBACK_MODELS = [
  "google/gemma-3-12b-it:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
  "nvidia/nemotron-nano-12b-v2-vl:free",
  "google/gemma-3-4b-it:free",
  "openrouter/healer-alpha",
];
const PROMPT_VERSION = "step-distillation-v1";
const MAX_PACKET_CHARS = 24000;
const MAX_PACKET_OUTPUT_TOKENS = 6000;
const MAX_FINAL_OUTPUT_TOKENS = 8000;
const VISION_PAGES_PER_PACKET = 6;
const DEFAULT_VISION_RENDER_DIR = resolve(DEFAULT_KNOWLEDGE_TMP_DIR, "vision-rescue");
const RENDER_PDF_PAGES_PATH = resolve(__dirname, "render_pdf_pages.py");

interface Packet {
  packetIndex: number;
  text: string;
}

interface VisionPagePacket {
  packetIndex: number;
  startPage: number;
  endPage: number;
}

interface RenderedPage {
  page: number;
  imagePath: string;
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

/** Max packets per batch when doing batched LLM merge (keeps prompt under ~60K chars). */
const MERGE_BATCH_SIZE = 10;

/**
 * Merge packet distillations via LLM in batches, then merge the batch results.
 * For small packet counts (<=MERGE_BATCH_SIZE), does a single LLM merge.
 * For large counts, batches packets first, then merges the batch summaries.
 */
async function mergePacketDistillations(
  title: string,
  sourcePath: string,
  packetDistillations: PacketDistillation[],
): Promise<{ final: FinalDistillation; usage: { prompt_tokens: number; completion_tokens: number } }> {
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;

  if (packetDistillations.length <= MERGE_BATCH_SIZE) {
    // Single merge — all packets fit in one prompt
    const { jsonText, usage } = await callStepFinalMerge(title, sourcePath, packetDistillations);
    totalPromptTokens += usage.prompt_tokens ?? 0;
    totalCompletionTokens += usage.completion_tokens ?? 0;
    return { final: JSON.parse(jsonText) as FinalDistillation, usage: { prompt_tokens: totalPromptTokens, completion_tokens: totalCompletionTokens } };
  }

  // Batched merge: split into batches, merge each, then merge the results
  console.error(`  Batched merge: ${packetDistillations.length} packets in ${Math.ceil(packetDistillations.length / MERGE_BATCH_SIZE)} batches`);
  const batchResults: PacketDistillation[] = [];
  for (let i = 0; i < packetDistillations.length; i += MERGE_BATCH_SIZE) {
    const batch = packetDistillations.slice(i, i + MERGE_BATCH_SIZE);
    const batchNum = Math.floor(i / MERGE_BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(packetDistillations.length / MERGE_BATCH_SIZE);
    console.error(`  Batch ${batchNum}/${totalBatches} (${batch.length} packets)`);
    const { jsonText, usage } = await callStepFinalMerge(title, sourcePath, batch);
    totalPromptTokens += usage.prompt_tokens ?? 0;
    totalCompletionTokens += usage.completion_tokens ?? 0;
    // Treat the batch merge result as a "super-packet" for the final merge
    const batchFinal = JSON.parse(jsonText) as FinalDistillation;
    batchResults.push({
      packet_summary: batchFinal.executive_summary,
      farmer_takeaways: batchFinal.farmer_takeaways,
      market_heuristics: batchFinal.market_heuristics,
      risk_watchouts: batchFinal.risk_watchouts,
      grain_tags: batchFinal.grain_focus,
      topic_tags: batchFinal.topic_tags,
      region_tags: batchFinal.region_tags,
      evidence_highlights: batchFinal.evidence_highlights,
    } as PacketDistillation);
  }

  // Final merge of all batch results
  console.error(`  Final merge of ${batchResults.length} batch summaries`);
  const { jsonText, usage } = await callStepFinalMerge(title, sourcePath, batchResults);
  totalPromptTokens += usage.prompt_tokens ?? 0;
  totalCompletionTokens += usage.completion_tokens ?? 0;
  return { final: JSON.parse(jsonText) as FinalDistillation, usage: { prompt_tokens: totalPromptTokens, completion_tokens: totalCompletionTokens } };
}

/**
 * Generate L0/L1/L2 tiered summaries from the final distillation.
 * L0: ~100 tokens — one-sentence essence for retrieval ranking
 * L1: ~500 tokens — key takeaways for context loading
 * L2: full distillation markdown
 */
async function generateTieredSummaries(
  final: FinalDistillation,
): Promise<{ l0: string; l1: string; usage: { prompt_tokens: number; completion_tokens: number } }> {
  const l0Prompt = `Summarize this grain knowledge distillation in exactly ONE sentence (under 30 words) that captures the most actionable insight for a prairie farmer. Output JSON: {"l0": "sentence"}

Title: ${final.title}
Summary: ${final.executive_summary}
Key takeaways: ${(final.farmer_takeaways ?? []).slice(0, 3).join("; ")}`;

  const l1Prompt = `Summarize this grain knowledge distillation in 3-5 bullet points (under 150 words total) focused on actionable insights for western Canadian grain farmers. Output JSON: {"l1": "bullet points as a single string with newlines"}

Title: ${final.title}
Summary: ${final.executive_summary}
Takeaways: ${(final.farmer_takeaways ?? []).join("\n- ")}
Heuristics: ${(final.market_heuristics ?? []).map(h => `${h.title}: ${h.body}`).join("\n")}`;

  const [l0Result, l1Result] = await Promise.all([
    callStep(l0Prompt, 200),
    callStep(l1Prompt, 600),
  ]);

  const l0 = (JSON.parse(l0Result.jsonText) as { l0: string }).l0 || "";
  const l1 = (JSON.parse(l1Result.jsonText) as { l1: string }).l1 || "";

  return {
    l0,
    l1,
    usage: {
      prompt_tokens: (l0Result.usage.prompt_tokens ?? 0) + (l1Result.usage.prompt_tokens ?? 0),
      completion_tokens: (l0Result.usage.completion_tokens ?? 0) + (l1Result.usage.completion_tokens ?? 0),
    },
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
  npm run distill-knowledge -- --allow-paid-pdf-parser-fallback  Use OpenRouter's paid PDF parser if vision rescue fails
  npm run distill-knowledge -- --skip-low-yield-rescue     Skip PDF rescue and leave weak PDFs excluded
  npm run distill-knowledge -- --model <id>                 Override distillation model (e.g. google/gemini-2.0-flash-001)
  npm run distill-knowledge -- --engine gemini              Use Gemini CLI instead of OpenRouter (bypasses rate limits)
  npm run distill-knowledge -- --force                     Regenerate even if source hash has not changed
  npm run distill-knowledge -- --help                      Show this help

Environment variables (from .env.local):
  OPENROUTER_API_KEY            OpenRouter key for Step 3.5 Flash
  BUSHEL_KNOWLEDGE_HOME         Local knowledge home (default: ${DEFAULT_KNOWLEDGE_HOME.replaceAll("\\", "/")})
  BUSHEL_KNOWLEDGE_LIBRARY_DIR  Override local raw book folder (default: ${DEFAULT_RAW_KNOWLEDGE_DIR.replaceAll("\\", "/")})
  BUSHEL_KNOWLEDGE_DISTILLATION_DIR  Override local distillation folder (default: ${DEFAULT_DISTILLATION_DIR.replaceAll("\\", "/")})
  BUSHEL_KNOWLEDGE_ENABLE_OCR   Enable local OCR for weak scanned PDFs
  OPENROUTER_VISION_MODEL       Optional override for the vision rescue model
  BUSHEL_KNOWLEDGE_VISION_RENDER_SCALE  Optional page render scale for vision rescue
  BUSHEL_KNOWLEDGE_TMP_DIR      Override local temp render folder

Artifacts:
  ${DEFAULT_DISTILLATION_DIR.replaceAll("\\", "/")}/*.distilled.md
  ${DEFAULT_DISTILLATION_DIR.replaceAll("\\", "/")}/*.distilled.json
`);
  process.exit(0);
}

const DRY_RUN = args.includes("--dry-run");
const FORCE = args.includes("--force");
const INCLUDE_FRAMEWORK = args.includes("--include-framework");
const ALLOW_LOW_YIELD = args.includes("--allow-low-yield");
const RESCUE_LOW_YIELD = !args.includes("--skip-low-yield-rescue");
const ENABLE_LOCAL_OCR = args.includes("--enable-local-ocr");
const ALLOW_PAID_PDF_PARSER_FALLBACK = args.includes("--allow-paid-pdf-parser-fallback");
const engineArgIndex = args.indexOf("--engine");
const ENGINE = engineArgIndex !== -1 ? args[engineArgIndex + 1]?.toLowerCase() : "openrouter";
if (ENGINE !== "openrouter" && ENGINE !== "gemini") {
  console.error("ERROR: --engine must be 'openrouter' or 'gemini'");
  process.exit(1);
}
const dirArgIndex = args.indexOf("--dir");
const limitArgIndex = args.indexOf("--limit");
const matchArgIndex = args.indexOf("--match");
const modelArgIndex = args.indexOf("--model");
const directoryOverride = dirArgIndex !== -1 ? args[dirArgIndex + 1] : null;
const documentLimit = limitArgIndex !== -1 ? Number(args[limitArgIndex + 1]) : null;
const matchFilter = matchArgIndex !== -1 ? args[matchArgIndex + 1]?.toLowerCase() : null;
const modelOverride = modelArgIndex !== -1 ? args[modelArgIndex + 1] : null;

if (documentLimit !== null && (!Number.isInteger(documentLimit) || documentLimit <= 0)) {
  console.error("ERROR: --limit must be a positive integer");
  process.exit(1);
}

loadEnvFile(resolve(__dirname, "../.env.local"));

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const KNOWLEDGE_DIR = directoryOverride ? resolve(directoryOverride) : DEFAULT_RAW_KNOWLEDGE_DIR;
const MODEL = modelOverride ?? process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;
const VISION_MODEL = process.env.OPENROUTER_VISION_MODEL ?? DEFAULT_VISION_MODEL;

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

function buildVisionPagePackets(pageCount: number): VisionPagePacket[] {
  const packets: VisionPagePacket[] = [];

  for (let startPage = 1; startPage <= pageCount; startPage += VISION_PAGES_PER_PACKET) {
    const endPage = Math.min(pageCount, startPage + VISION_PAGES_PER_PACKET - 1);
    packets.push({
      packetIndex: packets.length + 1,
      startPage,
      endPage,
    });
  }

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

function renderPdfPages(filePath: string, outputDir: string, startPage: number, endPage: number): RenderedPage[] {
  const result = spawnSync(
    "python",
    [RENDER_PDF_PAGES_PATH, filePath, outputDir, String(startPage), String(endPage)],
    {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    },
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(result.stdout || result.stderr || `PDF rendering failed for ${filePath}`);
  }

  const payload = JSON.parse(result.stdout) as {
    error?: string;
    pages?: Array<{ page: number; image_path: string }>;
  };

  if (payload.error) {
    throw new Error(payload.error);
  }

  return (payload.pages ?? []).map((page) => ({
    page: page.page,
    imagePath: page.image_path,
  }));
}

/** Call Gemini CLI as an alternative distillation engine.
 * Uses a temp file piped via stdin to avoid Windows command-line length limits (~32K chars). */
async function callStepGemini(
  prompt: string,
  _maxTokens: number,
): Promise<{
  jsonText: string;
  usage: { prompt_tokens: number | null; completion_tokens: number | null; total_tokens: number | null };
}> {
  const systemInstruction =
    "You distill commodity and grain marketing source material for western Canadian prairie farmers. Return only valid JSON with no markdown wrapper, no ```json fences. Preserve nuance, do not invent facts, and prefer practical marketing implications over academic trivia.";

  const fullPrompt = `${systemInstruction}\n\n${prompt}`;

  // Write prompt to temp file to avoid Windows 32K command-line limit
  const tmpDir = resolve(DEFAULT_KNOWLEDGE_TMP_DIR, "gemini-prompts");
  mkdirSync(tmpDir, { recursive: true });
  const tmpFile = resolve(tmpDir, `prompt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`);
  writeFileSync(tmpFile, fullPrompt, "utf8");

  try {
    // Pipe the temp file to gemini via stdin; -p "" tells Gemini to read stdin
    const result = spawnSync("bash", ["-c", `cat "${tmpFile.replace(/\\/g, "/")}" | gemini -p ""`], {
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024, // 20 MB
      timeout: 5 * 60 * 1000, // 5 min timeout per call
    });

    if (result.error) {
      throw new Error(`Gemini CLI error: ${result.error.message}`);
    }

    if (result.status !== 0) {
      const errMsg = (result.stderr || result.stdout || "unknown error").slice(0, 500);
      throw new Error(`Gemini CLI exited with code ${result.status}: ${errMsg}`);
    }

    const raw = (result.stdout || "").trim();
    if (!raw) {
      throw new Error("Gemini CLI returned empty response");
    }

    const jsonText = extractJsonObject(raw);
    return {
      jsonText,
      usage: { prompt_tokens: null, completion_tokens: null, total_tokens: null },
    };
  } finally {
    // Clean up temp file
    try { rmSync(tmpFile); } catch { /* ignore */ }
  }
}

/** Fallback free models to try when the primary model is rate-limited. */
const FALLBACK_MODELS = [
  "openrouter/healer-alpha",
  "stepfun/step-3.5-flash:free",
];
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 15000;

async function callStep(prompt: string, maxTokens: number, overrideModel?: string) {
  // Delegate to Gemini CLI when --engine gemini is set
  if (ENGINE === "gemini") {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const result = await callStepGemini(prompt, maxTokens);
        // Validate it's parseable JSON
        JSON.parse(result.jsonText);
        return result;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  Gemini attempt ${attempt + 1}/${MAX_RETRIES} failed: ${msg.slice(0, 200)}`);
        if (attempt < MAX_RETRIES - 1) {
          console.error(`  Retrying in 5s...`);
          await new Promise((r) => setTimeout(r, 5000));
        }
      }
    }
    throw new Error("Gemini CLI failed after all retries");
  }

  const modelsToTry = overrideModel
    ? [overrideModel]
    : [MODEL, ...FALLBACK_MODELS.filter((m) => m !== MODEL)];

  for (const modelId of modelsToTry) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const response = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "HTTP-Referer": "https://bushelboard.ca",
          "X-Title": "Bushel Board Knowledge Distiller",
        },
        body: JSON.stringify({
          model: modelId,
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

      if (response.ok) {
        const payload = await response.json();
        const content = payload.choices?.[0]?.message?.content ?? "";
        const usage = payload.usage ?? {};
        try {
          return {
            jsonText: extractJsonObject(content),
            usage: {
              prompt_tokens: usage.prompt_tokens ?? null,
              completion_tokens: usage.completion_tokens ?? null,
              total_tokens: usage.total_tokens ?? null,
            },
          };
        } catch (jsonError) {
          // Model returned non-JSON — retry with same model
          console.error(`  ${modelId} returned non-JSON (attempt ${attempt + 1}/${MAX_RETRIES}), retrying...`);
          continue;
        }
      }

      const errText = await response.text();
      if (response.status === 429 || response.status === 502 || response.status === 503) {
        console.error(`  ${response.status} on ${modelId} (attempt ${attempt + 1}/${MAX_RETRIES}), waiting ${RETRY_DELAY_MS / 1000}s...`);
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }

      // For non-retryable errors (402, 404), try next model
      if (response.status === 402 || response.status === 404) {
        console.error(`  ${modelId} unavailable (${response.status}), trying next model...`);
        break;
      }

      throw new Error(`OpenRouter ${response.status}: ${errText.slice(0, 300)}`);
    }
  }

  throw new Error(`All models exhausted after retries. Last model tried: ${modelsToTry[modelsToTry.length - 1]}`);
}

async function callStepFinalMerge(
  title: string,
  sourcePath: string,
  packetDistillations: PacketDistillation[],
) {
  const mergePrompt = `Merge these packet distillations into one final grain-marketing reference note for western Canadian prairie farmers.

Source title: ${title}
Source path: ${sourcePath}

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
- Merge duplicates and remove filler.
- Prefer practical farmer decision support over textbook framing.
- Keep the executive summary under 180 words.
- Do not invent citations.
- Output JSON only.

Packet distillations:
${JSON.stringify(packetDistillations, null, 2)}`;

  return callStep(mergePrompt, MAX_FINAL_OUTPUT_TOKENS);
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

async function callVisionPacketDistillation(options: {
  model: string;
  prompt: string;
  renderedPages: RenderedPage[];
  maxTokens: number;
}) {
  const content: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  > = [{ type: "text", text: options.prompt }];

  for (const page of options.renderedPages) {
    const imageBytes = readFileSync(page.imagePath);
    content.push({
      type: "text",
      text: `Page ${page.page}`,
    });
    content.push({
      type: "image_url",
      image_url: {
        url: `data:image/png;base64,${imageBytes.toString("base64")}`,
      },
    });
  }

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "HTTP-Referer": "https://bushelboard.ca",
      "X-Title": "Bushel Board Knowledge Vision Distiller",
    },
    body: JSON.stringify({
      model: options.model,
      messages: [
        {
          role: "user",
          content,
        },
      ],
      max_tokens: options.maxTokens,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenRouter vision ${response.status}: ${errText.slice(0, 300)}`);
  }

  const payload = await response.json();
  const contentText = payload.choices?.[0]?.message?.content ?? "";
  const usage = payload.usage ?? {};

  return {
    jsonText: extractJsonObject(contentText),
    usage: {
      prompt_tokens: usage.prompt_tokens ?? null,
      completion_tokens: usage.completion_tokens ?? null,
      total_tokens: usage.total_tokens ?? null,
    },
    model: payload.model ?? options.model,
  };
}

function sleep(ms: number) {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

async function callVisionPacketDistillationWithRetry(options: {
  prompt: string;
  renderedPages: RenderedPage[];
  maxTokens: number;
}) {
  let lastError: Error | null = null;
  const visionModelCandidates = dedupe([VISION_MODEL, ...VISION_FALLBACK_MODELS]);

  for (const model of visionModelCandidates) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await callVisionPacketDistillation({
          ...options,
          model,
        });
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const message = lastError.message.toLowerCase();
        const isRetryable =
          message.includes(" 429") ||
          message.includes("rate-limit") ||
          message.includes("temporarily rate-limited") ||
          message.includes("provider returned error") ||
          message.includes("json object");
        if (!isRetryable) {
          throw lastError;
        }
        if (attempt < 3) {
          await sleep(5000 * attempt);
        }
      }
    }
  }

  throw lastError ?? new Error("Vision packet distillation failed");
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

function buildVisionPacketPrompt(source: {
  title: string;
  sourcePath: string;
  packetIndex: number;
  packetCount: number;
  startPage: number;
  endPage: number;
}) {
  return `You are reading rendered page images from a scanned commodity-marketing PDF.

Source title: ${source.title}
Source path: ${source.sourcePath}
Packet: ${source.packetIndex} of ${source.packetCount}
Pages: ${source.startPage}-${source.endPage}

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
- Read only the attached page images for this packet.
- Focus on grain marketing, price discovery, hedging, basis, storage, logistics, demand, and farmer decision-making.
- Translate textbook material into practical knowledge for a western Canadian grain farmer.
- Use only page references from this packet in evidence_highlights, for example "page 12" or "pages 12-13".
- Keep arrays concise and high-signal.
- Output JSON only.`;
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
  modelUsed: string;
  warnings: string[];
  l0Summary?: string;
  l1Summary?: string;
}) {
  const { final } = options;
  const lines: string[] = [
    `# Distilled Grain Knowledge - ${final.title || options.sourceTitle}`,
    "",
    `Source Title: ${options.sourceTitle}`,
    `Source Path: ${options.sourcePath}`,
    `Source Hash: ${options.sourceHash}`,
    `Model Used: ${options.modelUsed}`,
    `Prompt Version: ${PROMPT_VERSION}`,
    `Generated At: ${new Date().toISOString()}`,
    `Packet Count: ${options.packetCount}`,
    `Extraction Warnings: ${options.warnings.length > 0 ? options.warnings.join(", ") : "none"}`,
    "",
  ];

  // L0/L1 tiered summaries (for retrieval ranking and context loading)
  if (options.l0Summary) {
    lines.push("## L0 Summary (Retrieval Ranking)", options.l0Summary, "");
  }
  if (options.l1Summary) {
    lines.push("## L1 Summary (Context Loading)", options.l1Summary, "");
  }

  lines.push(
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
  );

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

  if (!DRY_RUN && ENGINE === "openrouter" && !OPENROUTER_API_KEY) {
    console.error("ERROR: OPENROUTER_API_KEY must be set (or use --engine gemini).");
    process.exit(1);
  }

  console.error(`Engine: ${ENGINE}${ENGINE === "gemini" ? " (Gemini CLI)" : ` / Model: ${MODEL}${modelOverride ? " (--model override)" : ""}`}`);
  console.error(`Knowledge dir: ${KNOWLEDGE_DIR}`);

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
    const pageCount = Number(document.metadata.page_count ?? 0);

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

    const packets = shouldRescueLowYield ? [] : buildPackets(chunks);
    const visionPackets = shouldRescueLowYield && pageCount > 0 ? buildVisionPagePackets(pageCount) : [];

    if (DRY_RUN) {
      docsGenerated += 1;
      summaries.push({
        source_path: document.sourcePath,
        status: shouldRescueLowYield ? "dry_run_pdf_rescue" : "dry_run",
        chunk_count: chunks.length,
        packet_count: shouldRescueLowYield ? visionPackets.length : packets.length,
        distillation_mode: shouldRescueLowYield ? "vision_page_packets" : "chunk_packets",
        warnings,
        extraction_method: document.metadata.extraction_method ?? null,
        ocr_used: document.metadata.ocr_used ?? false,
        ocr_page_count: document.metadata.ocr_page_count ?? 0,
      });
      continue;
    }

    let promptTokens = 0;
    let completionTokens = 0;
    let distillationMode = shouldRescueLowYield ? "vision_page_packets" : "chunk_packets";
    let pdfRescueEngine: string | null = null;
    let visionModelUsed: string | null = null;
    let cachedVisionPackets = 0;
    let finalDistillation: FinalDistillation;

    if (shouldRescueLowYield) {
      if (visionPackets.length === 0) {
        throw new Error(`Vision rescue requires a page_count for ${document.sourcePath}`);
      }

      console.error(`  Using vision rescue mode on ${visionPackets.length} page packets`);
      const packetDistillations: PacketDistillation[] = [];
      const packetCacheDir = resolve(DEFAULT_DISTILLATION_DIR, ".packets", slug);
      mkdirSync(packetCacheDir, { recursive: true });

      try {
        for (const packet of visionPackets) {
          const packetCachePath = resolve(packetCacheDir, `packet-${String(packet.packetIndex).padStart(3, "0")}.json`);
          if (!FORCE && existsSync(packetCachePath)) {
            try {
              const cachedPacket = JSON.parse(readFileSync(packetCachePath, "utf-8")) as {
                source_hash?: string;
                packet_distillation?: PacketDistillation;
                usage?: { prompt_tokens?: number | null; completion_tokens?: number | null };
                vision_model_used?: string | null;
              };

              if (cachedPacket.source_hash === sourceHash && cachedPacket.packet_distillation) {
                console.error(`  Vision packet ${packet.packetIndex}/${visionPackets.length} restored from cache`);
                packetDistillations.push(cachedPacket.packet_distillation);
                promptTokens += cachedPacket.usage?.prompt_tokens ?? 0;
                completionTokens += cachedPacket.usage?.completion_tokens ?? 0;
                visionModelUsed = cachedPacket.vision_model_used ?? visionModelUsed;
                cachedVisionPackets += 1;
                continue;
              }
            } catch {
              // Regenerate invalid packet caches.
            }
          }

          console.error(`  Vision packet ${packet.packetIndex}/${visionPackets.length} (pages ${packet.startPage}-${packet.endPage})`);
          const packetDir = resolve(DEFAULT_VISION_RENDER_DIR, slug, `packet-${packet.packetIndex}`);
          const renderedPages = renderPdfPages(filePath, packetDir, packet.startPage, packet.endPage);

          try {
            const visionResponse = await callVisionPacketDistillationWithRetry({
              prompt: buildVisionPacketPrompt({
                title: document.title,
                sourcePath: document.sourcePath,
                packetIndex: packet.packetIndex,
                packetCount: visionPackets.length,
                startPage: packet.startPage,
                endPage: packet.endPage,
              }),
              renderedPages,
              maxTokens: MAX_PACKET_OUTPUT_TOKENS,
            });

            const packetDistillation = JSON.parse(visionResponse.jsonText) as PacketDistillation;
            packetDistillations.push(packetDistillation);
            promptTokens += visionResponse.usage.prompt_tokens ?? 0;
            completionTokens += visionResponse.usage.completion_tokens ?? 0;
            visionModelUsed = visionResponse.model;
            writeFileSync(
              packetCachePath,
              JSON.stringify({
                source_path: document.sourcePath,
                source_hash: sourceHash,
                prompt_version: PROMPT_VERSION,
                packet_index: packet.packetIndex,
                start_page: packet.startPage,
                end_page: packet.endPage,
                vision_model_used: visionResponse.model,
                generated_at: new Date().toISOString(),
                usage: visionResponse.usage,
                packet_distillation: packetDistillation,
              }, null, 2),
              "utf-8",
            );
          } finally {
            rmSync(packetDir, { recursive: true, force: true });
          }
        }

        try {
          const mergeResponse = await callStepFinalMerge(document.title, document.sourcePath, packetDistillations);
          promptTokens += mergeResponse.usage.prompt_tokens ?? 0;
          completionTokens += mergeResponse.usage.completion_tokens ?? 0;
          finalDistillation = JSON.parse(mergeResponse.jsonText) as FinalDistillation;
        } catch (mergeError) {
          console.error(`  Step merge fallback triggered: ${String(mergeError)}`);
          const fallbackMerge = await mergePacketDistillations(document.title, document.sourcePath, packetDistillations);
          finalDistillation = fallbackMerge.final;
          promptTokens += fallbackMerge.usage.prompt_tokens;
          completionTokens += fallbackMerge.usage.completion_tokens;
        }
      } catch (visionError) {
        if (!ALLOW_PAID_PDF_PARSER_FALLBACK) {
          throw new Error(
            `Vision rescue failed after ${packetDistillations.length} completed packets. Rerun the command to resume from cached packets, or add --allow-paid-pdf-parser-fallback to try OpenRouter's paid PDF parser. Root cause: ${String(visionError)}`,
          );
        }

        console.error(`  Vision rescue failed, attempting PDF parser fallback: ${String(visionError)}`);
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
        distillationMode = "pdf_file_parser";
        finalDistillation = JSON.parse(rescueResponse.jsonText) as FinalDistillation;
      }
    } else {
      const packetDistillations: PacketDistillation[] = [];

      for (const packet of packets) {
        console.error(`  Packet ${packet.packetIndex}/${packets.length}`);
        let parsed = false;
        for (let parseAttempt = 0; parseAttempt < 3 && !parsed; parseAttempt++) {
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
          promptTokens += usage.prompt_tokens ?? 0;
          completionTokens += usage.completion_tokens ?? 0;
          try {
            packetDistillations.push(JSON.parse(jsonText) as PacketDistillation);
            parsed = true;
          } catch (parseError) {
            console.error(`  Malformed JSON on packet ${packet.packetIndex} (attempt ${parseAttempt + 1}/3), retrying...`);
          }
        }
        if (!parsed) {
          console.error(`  Skipping packet ${packet.packetIndex} after 3 parse failures`);
        }
      }
      console.error(`  Merging ${packetDistillations.length} packet distillations via LLM...`);
      const mergeResult = await mergePacketDistillations(document.title, document.sourcePath, packetDistillations);
      finalDistillation = mergeResult.final;
      promptTokens += mergeResult.usage.prompt_tokens;
      completionTokens += mergeResult.usage.completion_tokens;
    }
    // Normalize — dedupe but preserve all items from LLM merge (no arbitrary .slice truncation)
    const normalizedFinal: FinalDistillation = {
      title: finalDistillation.title || document.title,
      executive_summary: finalDistillation.executive_summary || "",
      farmer_takeaways: dedupe(finalDistillation.farmer_takeaways ?? []),
      market_heuristics: finalDistillation.market_heuristics ?? [],
      risk_watchouts: dedupe(finalDistillation.risk_watchouts ?? []),
      grain_focus: dedupe(finalDistillation.grain_focus ?? []),
      topic_tags: dedupe(finalDistillation.topic_tags ?? []),
      region_tags: dedupe(finalDistillation.region_tags ?? []),
      evidence_highlights: finalDistillation.evidence_highlights ?? [],
    };

    // Generate L0/L1/L2 tiered summaries
    let l0Summary = "";
    let l1Summary = "";
    if (!DRY_RUN) {
      console.error(`  Generating L0/L1 tiered summaries...`);
      try {
        const tiered = await generateTieredSummaries(normalizedFinal);
        l0Summary = tiered.l0;
        l1Summary = tiered.l1;
        promptTokens += tiered.usage.prompt_tokens;
        completionTokens += tiered.usage.completion_tokens;
      } catch (tierError) {
        console.error(`  L0/L1 generation failed (non-fatal): ${String(tierError)}`);
      }
    }

    writeFileSync(
      markdownPath,
      renderMarkdown({
        final: normalizedFinal,
        sourceTitle: document.title,
        sourcePath: document.sourcePath,
        sourceHash,
        packetCount: shouldRescueLowYield ? visionPackets.length : packets.length,
        modelUsed: distillationMode === "vision_page_packets" && visionModelUsed ? `${visionModelUsed} + ${MODEL}` : MODEL,
        warnings,
        l0Summary,
        l1Summary,
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
        model_used: distillationMode === "vision_page_packets" && visionModelUsed ? `${visionModelUsed} + ${MODEL}` : MODEL,
        source_metadata: document.metadata,
        packet_count: shouldRescueLowYield ? visionPackets.length : packets.length,
        distillation_mode: distillationMode,
        pdf_rescue_engine: pdfRescueEngine,
        vision_model_used: visionModelUsed,
        cached_vision_packets: cachedVisionPackets,
        l0_summary: l0Summary || null,
        l1_summary: l1Summary || null,
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
      packet_count: shouldRescueLowYield ? visionPackets.length : packets.length,
      distillation_mode: distillationMode,
      pdf_rescue_engine: pdfRescueEngine,
      vision_model_used: visionModelUsed,
      cached_vision_packets: cachedVisionPackets,
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
    vision_model: VISION_MODEL,
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
