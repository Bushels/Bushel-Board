import { spawnSync } from "child_process";
import { createHash } from "crypto";
import { existsSync, readFileSync } from "fs";
import { readdir, stat } from "fs/promises";
import { basename, extname, relative, resolve } from "path";

export type SourceType = "framework" | "guide" | "book" | "reference" | "note";

export interface SourceDocument {
  sourcePath: string;
  title: string;
  sourceType: SourceType;
  mimeType: string;
  fileSizeBytes: number;
  rawText: string;
  metadata: Record<string, unknown>;
  sourcePriority: number;
}

export interface ChunkRecord {
  heading: string | null;
  content: string;
  grain_tags: string[];
  topic_tags: string[];
  region_tags: string[];
  source_priority: number;
  metadata: Record<string, unknown>;
}

export const WORKSPACE_ROOT = resolve(__dirname, "..");
export const DEFAULT_RAW_KNOWLEDGE_DIR = resolve(WORKSPACE_ROOT, "data/Knowledge");
export const DEFAULT_DISTILLATION_DIR = resolve(WORKSPACE_ROOT, "data/knowledge/distillations");
export const SEED_SOURCE_PATHS = [
  resolve(WORKSPACE_ROOT, "docs/reference/grain-market-intelligence-framework-v2.md"),
];
const PDF_EXTRACTOR_PATH = resolve(__dirname, "extract_pdf_text.py");
const EPUB_EXTRACTOR_PATH = resolve(__dirname, "extract_epub_text.py");

const GRAIN_PATTERNS: Array<{ tag: string; pattern: RegExp }> = [
  { tag: "Amber Durum", pattern: /\bamber durum\b|\bdurum\b/i },
  { tag: "Barley", pattern: /\bbarley\b/i },
  { tag: "Beans", pattern: /\bbeans?\b/i },
  { tag: "Canaryseed", pattern: /\bcanaryseed\b/i },
  { tag: "Canola", pattern: /\bcanola\b/i },
  { tag: "Chick Peas", pattern: /\bchick ?peas?\b/i },
  { tag: "Corn", pattern: /\bcorn\b/i },
  { tag: "Flaxseed", pattern: /\bflax(seed)?\b/i },
  { tag: "Lentils", pattern: /\blentils?\b/i },
  { tag: "Mustard Seed", pattern: /\bmustard\b/i },
  { tag: "Oats", pattern: /\boats?\b/i },
  { tag: "Peas", pattern: /\bpeas?\b/i },
  { tag: "Rye", pattern: /\brye\b/i },
  { tag: "Soybeans", pattern: /\bsoy(bean|beans)?\b/i },
  { tag: "Sunflower", pattern: /\bsunflower\b/i },
  { tag: "Wheat", pattern: /\bwheat\b/i },
];

const TOPIC_PATTERNS: Array<{ tag: string; pattern: RegExp }> = [
  { tag: "basis", pattern: /\bbasis\b/i },
  { tag: "hedging", pattern: /\bhedg(e|ed|ing)\b/i },
  { tag: "futures", pattern: /\bfutures?\b/i },
  { tag: "options", pattern: /\boptions?\b/i },
  { tag: "storage", pattern: /\bstorage\b|\bbins?\b/i },
  { tag: "exports", pattern: /\bexports?\b|\bshipment(s)?\b/i },
  { tag: "deliveries", pattern: /\bdeliver(y|ies)\b|\bproducer cars\b/i },
  { tag: "stocks", pattern: /\bstocks?\b|\binventor(y|ies)\b/i },
  { tag: "logistics", pattern: /\brail\b|\bterminal\b|\bport\b|\blogistics\b|\bvessel\b/i },
  { tag: "crush", pattern: /\bcrush\b|\bprocessing\b|\bprocessor(s)?\b/i },
  { tag: "seasonality", pattern: /\bseason(al|ality)?\b|\bharvest\b|\bseeding\b/i },
  { tag: "spreads", pattern: /\bspread(s)?\b|\bcarry\b|\bbackwardation\b|\bcontango\b/i },
  { tag: "risk_management", pattern: /\brisk\b|\bmargin call\b|\bleverage\b/i },
  { tag: "trade_policy", pattern: /\btariff(s)?\b|\btrade\b|\bchina\b/i },
  { tag: "farmer_marketing", pattern: /\bmarketing\b|\bcash sale(s)?\b|\bpricing\b/i },
];

const REGION_PATTERNS: Array<{ tag: string; pattern: RegExp }> = [
  { tag: "Western Canada", pattern: /\bwestern canada\b|\bcanadian prairies\b|\bprairie(s)?\b/i },
  { tag: "Alberta", pattern: /\balberta\b/i },
  { tag: "Saskatchewan", pattern: /\bsaskatchewan\b/i },
  { tag: "Manitoba", pattern: /\bmanitoba\b/i },
  { tag: "British Columbia", pattern: /\bbritish columbia\b|\bbc\b/i },
  { tag: "Vancouver", pattern: /\bvancouver\b/i },
  { tag: "Prince Rupert", pattern: /\bprince rupert\b/i },
  { tag: "Thunder Bay", pattern: /\bthunder bay\b/i },
  { tag: "Churchill", pattern: /\bchurchill\b/i },
  { tag: "St. Lawrence", pattern: /\bst\.? lawrence\b/i },
  { tag: "China", pattern: /\bchina\b/i },
  { tag: "Australia", pattern: /\baustralia\b|\baustralian\b/i },
  { tag: "Argentina", pattern: /\bargentina\b|\bargentine\b/i },
  { tag: "United States", pattern: /\b(united states|u\.s\.|usa)\b/i },
];

export function loadEnvFile(filePath: string) {
  try {
    const content = readFileSync(filePath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // Ignore missing env file when variables are already present.
  }
}

export function toPosixPath(filePath: string): string {
  return filePath.replaceAll("\\", "/");
}

export function toRepoPath(filePath: string): string {
  return toPosixPath(relative(WORKSPACE_ROOT, filePath));
}

export function normalizeText(text: string): string {
  return text
    .replace(/\u0000/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function detectTags(text: string, patterns: Array<{ tag: string; pattern: RegExp }>): string[] {
  return patterns.filter(({ pattern }) => pattern.test(text)).map(({ tag }) => tag);
}

export function inferSourceType(filePath: string): SourceType {
  const lower = filePath.toLowerCase();
  if (lower.includes("distillations")) return "note";
  if (lower.includes("framework")) return "framework";
  if (lower.includes("guide") || lower.includes("introduction")) return "guide";
  if (lower.includes("reference")) return "reference";
  if (lower.includes("note")) return "note";
  return "book";
}

export function inferSourcePriority(filePath: string): number {
  const lower = filePath.toLowerCase();
  if (lower.includes("data/knowledge/distillations")) return 98;
  if (lower.includes("grain-market-intelligence-framework")) return 100;
  if (lower.includes("introduction_to_grain_marketing")) return 95;
  if (lower.includes("hedging")) return 95;
  if (lower.includes("agricultural marketing and price analysis")) return 90;
  if (lower.includes("agricultural prices and commodity market analysis")) return 90;
  if (lower.includes("traders first book")) return 85;
  if (lower.includes("economics of futures trading")) return 85;
  if (lower.includes("merchants of grain")) return 65;
  if (lower.includes("out of the shadows")) return 65;
  return 75;
}

export function humanTitle(filePath: string): string {
  return basename(filePath, extname(filePath))
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function chunkParagraphs(paragraphs: string[], options: { maxChars: number; overlapParagraphs: number }) {
  const chunks: string[] = [];
  const pageRanges: Array<{ start: number | null; end: number | null }> = [];
  let currentParagraphs: string[] = [];
  let currentLength = 0;
  let pageStart: number | null = null;
  let pageEnd: number | null = null;

  function flush() {
    if (currentParagraphs.length === 0) return;
    chunks.push(currentParagraphs.join("\n\n").trim());
    pageRanges.push({ start: pageStart, end: pageEnd });
    currentParagraphs = currentParagraphs.slice(-options.overlapParagraphs);
    currentLength = currentParagraphs.join("\n\n").length;
    const overlapPages = currentParagraphs
      .map((paragraph) => {
        const pageMatch = paragraph.match(/^\[(Page|Chapter) (\d+)\]$/);
        return pageMatch ? Number(pageMatch[2]) : null;
      })
      .filter((value): value is number => value !== null);
    pageStart = overlapPages.length > 0 ? overlapPages[0] : pageEnd;
    pageEnd = overlapPages.length > 0 ? overlapPages[overlapPages.length - 1] : pageEnd;
  }

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;

    const markerMatch = trimmed.match(/^\[(Page|Chapter) (\d+)\]$/);
    if (markerMatch) {
      const markerNumber = Number(markerMatch[2]);
      if (pageStart === null) pageStart = markerNumber;
      pageEnd = markerNumber;
    }

    const nextLength = currentLength + (currentParagraphs.length > 0 ? 2 : 0) + trimmed.length;
    if (nextLength > options.maxChars && currentParagraphs.length > 0) {
      flush();
    }

    currentParagraphs.push(trimmed);
    currentLength = currentParagraphs.join("\n\n").length;
  }

  flush();
  return { chunks, pageRanges };
}

function splitMarkdownSections(text: string) {
  const lines = text.split("\n");
  const sections: Array<{ heading: string | null; body: string }> = [];
  let currentHeading: string | null = null;
  let currentLines: string[] = [];

  function pushSection() {
    const body = normalizeText(currentLines.join("\n"));
    if (!body) return;
    sections.push({ heading: currentHeading, body });
    currentLines = [];
  }

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      pushSection();
      currentHeading = headingMatch[2].trim();
      continue;
    }

    currentLines.push(line);
  }

  pushSection();
  return sections;
}

export function buildChunks(document: SourceDocument): ChunkRecord[] {
  const ext = extname(document.sourcePath).toLowerCase();
  const sections =
    ext === ".md"
      ? splitMarkdownSections(document.rawText)
      : [{ heading: null, body: document.rawText }];

  const chunkRecords: ChunkRecord[] = [];

  for (const section of sections) {
    const paragraphs = section.body
      .split(/\n\s*\n/)
      .map((paragraph) => normalizeText(paragraph))
      .filter(Boolean);

    const { chunks, pageRanges } = chunkParagraphs(paragraphs, {
      maxChars: ext === ".md" ? 1800 : 1600,
      overlapParagraphs: 1,
    });

    chunks.forEach((chunk, index) => {
      const combinedText = `${document.title}\n${section.heading ?? ""}\n${chunk}`;
      const pageRange = pageRanges[index];

      chunkRecords.push({
        heading: section.heading,
        content: chunk,
        grain_tags: detectTags(combinedText, GRAIN_PATTERNS),
        topic_tags: detectTags(combinedText, TOPIC_PATTERNS),
        region_tags: detectTags(combinedText, REGION_PATTERNS),
        source_priority: document.sourcePriority,
        metadata: {
          ...document.metadata,
          section: section.heading,
          page_start: pageRange?.start ?? null,
          page_end: pageRange?.end ?? null,
        },
      });
    });
  }

  return chunkRecords;
}

export function getExtractionWarnings(document: SourceDocument, normalizedText: string, chunks: ChunkRecord[]): string[] {
  const warnings: string[] = [];
  const pageCount = Number(document.metadata.page_count ?? 0);
  const chapterCount = Number(document.metadata.chapter_count ?? 0);
  const structuralUnits = pageCount || chapterCount;

  if (structuralUnits >= 20 && normalizedText.length < structuralUnits * 250) {
    warnings.push("low_text_yield_for_source_size");
  }

  if (structuralUnits >= 20 && chunks.length <= 5) {
    warnings.push("very_few_chunks_for_large_source");
  }

  return warnings;
}

function extractPdfText(filePath: string): { text: string; pageCount: number; ocrUsed: boolean; ocrPageCount: number } {
  const result = spawnSync("python", [PDF_EXTRACTOR_PATH, filePath], {
    cwd: WORKSPACE_ROOT,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(result.stdout || result.stderr || `PDF extraction failed for ${filePath}`);
  }

  const payload = JSON.parse(result.stdout) as {
    error?: string;
    page_count?: number;
    ocr_used?: boolean;
    ocr_page_count?: number;
    pages?: Array<{ page: number; text: string }>;
  };

  if (payload.error) {
    throw new Error(payload.error);
  }

  const pageTexts = (payload.pages ?? []).map((page) => {
    const clean = normalizeText(page.text ?? "");
    return clean ? `[Page ${page.page}]\n\n${clean}` : `[Page ${page.page}]`;
  });

  return {
    text: normalizeText(pageTexts.join("\n\n")),
    pageCount: payload.page_count ?? pageTexts.length,
    ocrUsed: payload.ocr_used ?? false,
    ocrPageCount: payload.ocr_page_count ?? 0,
  };
}

function extractEpubText(filePath: string): { text: string; chapterCount: number } {
  const result = spawnSync("python", [EPUB_EXTRACTOR_PATH, filePath], {
    cwd: WORKSPACE_ROOT,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(result.stdout || result.stderr || `EPUB extraction failed for ${filePath}`);
  }

  const payload = JSON.parse(result.stdout) as {
    error?: string;
    chapter_count?: number;
    chapters?: Array<{ chapter: number; text: string }>;
  };

  if (payload.error) {
    throw new Error(payload.error);
  }

  const chapterTexts = (payload.chapters ?? []).map((chapter) => {
    const clean = normalizeText(chapter.text ?? "");
    return clean ? `[Chapter ${chapter.chapter}]\n\n${clean}` : `[Chapter ${chapter.chapter}]`;
  });

  return {
    text: normalizeText(chapterTexts.join("\n\n")),
    chapterCount: payload.chapter_count ?? chapterTexts.length,
  };
}

export async function loadDocument(filePath: string): Promise<SourceDocument | null> {
  const fileStats = await stat(filePath);
  const ext = extname(filePath).toLowerCase();
  const sourcePath = toRepoPath(filePath);
  const title = humanTitle(filePath);
  const sourceType = inferSourceType(sourcePath);
  const sourcePriority = inferSourcePriority(sourcePath);

  if (ext === ".pdf") {
    const { text, pageCount, ocrUsed, ocrPageCount } = extractPdfText(filePath);
    if (!text) return null;

    return {
      sourcePath,
      title,
      sourceType,
      mimeType: "application/pdf",
      fileSizeBytes: fileStats.size,
      rawText: text,
      metadata: {
        page_count: pageCount,
        extraction_method: ocrUsed ? "pypdf+rapidocr" : "pypdf",
        ocr_used: ocrUsed,
        ocr_page_count: ocrPageCount,
        filename: basename(filePath),
      },
      sourcePriority,
    };
  }

  if (ext === ".epub") {
    const { text, chapterCount } = extractEpubText(filePath);
    if (!text) return null;

    return {
      sourcePath,
      title,
      sourceType,
      mimeType: "application/epub+zip",
      fileSizeBytes: fileStats.size,
      rawText: text,
      metadata: {
        chapter_count: chapterCount,
        extraction_method: "epub-zip",
        filename: basename(filePath),
      },
      sourcePriority,
    };
  }

  if (ext === ".md" || ext === ".txt") {
    const rawText = normalizeText(readFileSync(filePath, "utf-8"));
    if (!rawText) return null;

    return {
      sourcePath,
      title,
      sourceType,
      mimeType: ext === ".md" ? "text/markdown" : "text/plain",
      fileSizeBytes: fileStats.size,
      rawText,
      metadata: {
        filename: basename(filePath),
      },
      sourcePriority,
    };
  }

  return null;
}

export async function listKnowledgeFiles(directory: string): Promise<string[]> {
  if (!existsSync(directory)) {
    return [];
  }

  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => resolve(directory, entry.name))
    .filter((filePath) => [".pdf", ".epub", ".md", ".txt"].includes(extname(filePath).toLowerCase()))
    .sort((a, b) => a.localeCompare(b));
}

export async function collectKnowledgeFiles(options?: {
  rawDirectory?: string;
  includeSeedDocs?: boolean;
  includeDistillations?: boolean;
  distillationDirectory?: string;
}) {
  const rawDirectory = options?.rawDirectory ?? DEFAULT_RAW_KNOWLEDGE_DIR;
  const distillationDirectory = options?.distillationDirectory ?? DEFAULT_DISTILLATION_DIR;

  const files = [
    ...(await listKnowledgeFiles(rawDirectory)),
    ...(options?.includeDistillations ? await listKnowledgeFiles(distillationDirectory) : []),
    ...((options?.includeSeedDocs ?? false) ? SEED_SOURCE_PATHS.filter((filePath) => existsSync(filePath)) : []),
  ];

  return [...new Set(files)].sort((a, b) => a.localeCompare(b));
}
