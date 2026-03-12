#!/usr/bin/env npx tsx
/**
 * Knowledge ingestion script.
 *
 * Reads the local knowledge corpus, extracts text, chunks it, tags it, and
 * upserts it into Supabase for retrieval-led prompting.
 *
 * Usage:
 *   npm run ingest-knowledge
 *   npm run ingest-knowledge -- --dry-run
 *   npm run ingest-knowledge -- --help
 *
 * Output: JSON summary to stdout, diagnostics to stderr.
 * Idempotent: upserts documents by source_path and replaces chunks only when the
 * normalized source hash changes.
 */

import { createClient } from "@supabase/supabase-js";
import { existsSync, readdirSync, readFileSync } from "fs";
import { basename, extname, resolve } from "path";
import {
  buildChunks,
  collectKnowledgeFiles,
  DEFAULT_DISTILLATION_DIR,
  DEFAULT_KNOWLEDGE_HOME,
  DEFAULT_RAW_KNOWLEDGE_DIR,
  getExtractionWarnings,
  loadDocument,
  loadEnvFile,
  normalizeText,
  sha256,
  WORKSPACE_ROOT,
} from "./knowledge-lib";

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.error(`
Knowledge Ingestion Script - Build the grain intelligence retrieval corpus

Usage:
  npm run ingest-knowledge                               Extract and upsert the knowledge corpus
  npm run ingest-knowledge -- --dry-run                  Extract and chunk only, do not write to Supabase
  npm run ingest-knowledge -- --dir <path>               Override the raw knowledge directory
  npm run ingest-knowledge -- --limit <n>                Process only the first n documents
  npm run ingest-knowledge -- --exclude-distillations    Ignore Step-generated distillation markdown
  npm run ingest-knowledge -- --help                     Show this help

Environment variables (from .env.local):
  NEXT_PUBLIC_SUPABASE_URL      Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY     Service role key
  BUSHEL_KNOWLEDGE_HOME         Local knowledge home (default: ${DEFAULT_KNOWLEDGE_HOME.replaceAll("\\", "/")})
  BUSHEL_KNOWLEDGE_LIBRARY_DIR  Override local raw book folder (default: ${DEFAULT_RAW_KNOWLEDGE_DIR.replaceAll("\\", "/")})
  BUSHEL_KNOWLEDGE_DISTILLATION_DIR  Override local distillation folder (default: ${DEFAULT_DISTILLATION_DIR.replaceAll("\\", "/")})

Dependencies:
  python -m pip install -r scripts/requirements-knowledge.txt

Notes:
  - docs/reference/grain-market-intelligence-framework-v2.md is included automatically.
  - local distillations are included by default when present.
  - supabase/functions/_shared/commodity-knowledge.ts remains a prompt fallback and is
    intentionally not ingested to avoid double-weighting the same distilled content.
`);
  process.exit(0);
}

const DRY_RUN = args.includes("--dry-run");
const EXCLUDE_DISTILLATIONS = args.includes("--exclude-distillations");
const dirArgIndex = args.indexOf("--dir");
const limitArgIndex = args.indexOf("--limit");
const directoryOverride = dirArgIndex !== -1 ? args[dirArgIndex + 1] : null;
const documentLimit = limitArgIndex !== -1 ? Number(args[limitArgIndex + 1]) : null;

if (documentLimit !== null && (!Number.isInteger(documentLimit) || documentLimit <= 0)) {
  console.error("ERROR: --limit must be a positive integer");
  process.exit(1);
}

loadEnvFile(resolve(__dirname, "../.env.local"));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const KNOWLEDGE_DIR = directoryOverride ? resolve(directoryOverride) : DEFAULT_RAW_KNOWLEDGE_DIR;

function loadDistilledCoverage(): Set<string> {
  if (EXCLUDE_DISTILLATIONS || !existsSync(DEFAULT_DISTILLATION_DIR)) {
    return new Set<string>();
  }

  const coveredSources = new Set<string>();
  const metadataFiles = readdirSync(DEFAULT_DISTILLATION_DIR)
    .filter((fileName) => fileName.endsWith(".distilled.json"))
    .map((fileName) => resolve(DEFAULT_DISTILLATION_DIR, fileName));

  for (const metadataPath of metadataFiles) {
    try {
      const payload = JSON.parse(readFileSync(metadataPath, "utf-8")) as {
        source_path?: string;
      };
      if (payload.source_path) {
        coveredSources.add(payload.source_path);
      }
    } catch {
      // Ignore invalid distillation metadata files during coverage discovery.
    }
  }

  return coveredSources;
}

async function ingestKnowledge() {
  if (!existsSync(KNOWLEDGE_DIR)) {
    console.error(`ERROR: Knowledge directory not found: ${KNOWLEDGE_DIR}`);
    process.exit(1);
  }

  const startTime = Date.now();
  const files = await collectKnowledgeFiles({
    rawDirectory: KNOWLEDGE_DIR,
    includeSeedDocs: true,
    includeDistillations: !EXCLUDE_DISTILLATIONS,
  });
  const selectedFiles = documentLimit ? files.slice(0, documentLimit) : files;
  const distilledCoverage = loadDistilledCoverage();

  if (!DRY_RUN && (!SUPABASE_URL || !SUPABASE_SERVICE_KEY)) {
    console.error("ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
    console.error("Check your .env.local file.");
    process.exit(1);
  }

  const supabase = !DRY_RUN && SUPABASE_URL && SUPABASE_SERVICE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    : null;

  let docsScanned = 0;
  let docsIngested = 0;
  let docsSkipped = 0;
  let chunksWritten = 0;
  const sourceSummaries: Array<Record<string, unknown>> = [];

  for (const filePath of selectedFiles) {
    docsScanned += 1;
    console.error(`Processing ${basename(filePath)}...`);

    const document = await loadDocument(filePath);
    if (!document) {
      docsSkipped += 1;
      sourceSummaries.push({
        source_path: filePath.replace(`${WORKSPACE_ROOT}\\`, "").replaceAll("\\", "/"),
        status: "skipped",
        reason: "empty_or_unsupported",
      });
      continue;
    }

    const normalizedText = normalizeText(document.rawText);
    const sourceHash = sha256(normalizedText);
    const chunks = buildChunks({ ...document, rawText: normalizedText });
    const extractionWarnings = getExtractionWarnings(document, normalizedText, chunks);
    const rawSourceCoveredByDistillation =
      extname(document.sourcePath).toLowerCase() === ".pdf" &&
      distilledCoverage.has(document.sourcePath) &&
      extractionWarnings.includes("low_text_yield_for_source_size");

    if (rawSourceCoveredByDistillation) {
      docsSkipped += 1;
      sourceSummaries.push({
        source_path: document.sourcePath,
        status: "skipped_low_yield_raw_covered_by_distillation",
        warnings: extractionWarnings,
      });
      continue;
    }

    if (DRY_RUN) {
      docsIngested += 1;
      chunksWritten += chunks.length;
      sourceSummaries.push({
        source_path: document.sourcePath,
        status: "dry_run",
        chunk_count: chunks.length,
        source_hash: sourceHash,
        warnings: extractionWarnings,
      });
      continue;
    }

    const { data: existingDoc, error: existingError } = await supabase!
      .from("knowledge_documents")
      .select("id, source_hash")
      .eq("source_path", document.sourcePath)
      .maybeSingle();

    if (existingError) {
      throw new Error(`Failed to query existing document ${document.sourcePath}: ${existingError.message}`);
    }

    if (existingDoc && existingDoc.source_hash === sourceHash) {
      docsSkipped += 1;
      sourceSummaries.push({
        source_path: document.sourcePath,
        status: "unchanged",
        warnings: extractionWarnings,
      });
      continue;
    }

    const docRow = {
      source_path: document.sourcePath,
      source_hash: sourceHash,
      title: document.title,
      source_type: document.sourceType,
      mime_type: document.mimeType,
      language_code: "en",
      summary: normalizedText.slice(0, 500),
      metadata: {
        ...document.metadata,
        file_size_bytes: document.fileSizeBytes,
        extraction_warnings: extractionWarnings,
      },
      chunk_count: chunks.length,
      extracted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: upsertedDoc, error: docError } = await supabase!
      .from("knowledge_documents")
      .upsert(docRow, { onConflict: "source_path" })
      .select("id")
      .single();

    if (docError || !upsertedDoc) {
      throw new Error(`Failed to upsert document ${document.sourcePath}: ${docError?.message ?? "unknown error"}`);
    }

    const documentId = upsertedDoc.id as number;

    const { error: deleteError } = await supabase!
      .from("knowledge_chunks")
      .delete()
      .eq("document_id", documentId);

    if (deleteError) {
      throw new Error(`Failed to clear chunks for ${document.sourcePath}: ${deleteError.message}`);
    }

    const chunkRows = chunks.map((chunk, index) => ({
      document_id: documentId,
      chunk_index: index,
      ...chunk,
    }));

    const BATCH_SIZE = 200;
    for (let i = 0; i < chunkRows.length; i += BATCH_SIZE) {
      const batch = chunkRows.slice(i, i + BATCH_SIZE);
      const { error: chunkError } = await supabase!.from("knowledge_chunks").insert(batch);
      if (chunkError) {
        throw new Error(`Failed to insert chunks for ${document.sourcePath}: ${chunkError.message}`);
      }
    }

    docsIngested += 1;
    chunksWritten += chunkRows.length;
    sourceSummaries.push({
      source_path: document.sourcePath,
      status: existingDoc ? "updated" : "inserted",
      chunk_count: chunkRows.length,
      warnings: extractionWarnings,
    });
  }

  const durationMs = Date.now() - startTime;
  console.log(JSON.stringify({
    dry_run: DRY_RUN,
    docs_scanned: docsScanned,
    docs_ingested: docsIngested,
    docs_skipped: docsSkipped,
    chunks_written: chunksWritten,
    duration_ms: durationMs,
    sources: sourceSummaries,
  }, null, 2));
}

ingestKnowledge().catch((error) => {
  console.error(`Fatal error: ${String(error)}`);
  process.exit(1);
});
