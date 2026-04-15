/**
 * Daily Compression Engine
 *
 * Processes ephemeral extractions during the nightly 10 PM MST compression
 * cycle, triaging each into one of five decisions:
 *   - promote:     new knowledge entry (no existing match)
 *   - corroborate: confirms an existing entry (bump source_count)
 *   - supersede:   replaces an existing entry with newer data
 *   - discard:     extraction has no usable value
 *   - defer:       large discrepancy flagged for human/Hermes review
 *
 * Delegates numeric comparison logic to the supersession engine.
 */

import {
  shouldSupersede,
  type KnowledgeEntry,
} from '@/lib/knowledge/supersession';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExtractionForTriage {
  category: string;
  data_type: string;
  grain: string | null;
  fsa_code: string;
  value_numeric: number | null;
  value_text: string | null;
  location_detail: string | null;
  confidence: string;
}

export interface TriageDecision {
  action: 'promote' | 'corroborate' | 'supersede' | 'discard' | 'defer';
  reason: string;
  existing_id?: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface CompressionStats {
  conversations_processed: number;
  extractions_total: number;
  promoted: number;
  corroborated: number;
  superseded: number;
  discarded: number;
  deferred: number;
}

export interface SupersessionRecord {
  what: string;
  old_value: string;
  new_value: string;
  reason: string;
  confidence: string;
}

export interface ReviewFlag {
  issue: string;
  detail: string;
  hermes_suggestion: string;
}

export interface DailySummary {
  date: string;
  stats: CompressionStats;
  supersession_decisions: SupersessionRecord[];
  flags_for_review: ReviewFlag[];
  patterns_detected: string[];
  aging_warnings: { entry: string; last_updated: string; note: string }[];
  weather_summary: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * An extraction is considered empty (no usable value) when both numeric
 * and text values are null.
 */
function isEmptyExtraction(extraction: ExtractionForTriage): boolean {
  return extraction.value_numeric == null && extraction.value_text == null;
}

/**
 * Check whether an existing knowledge entry matches an extraction on the
 * identity dimensions: FSA, category, data_type, and grain.
 */
function isIdentityMatch(
  existing: KnowledgeEntry,
  extraction: ExtractionForTriage,
): boolean {
  if (existing.fsa_code !== extraction.fsa_code) return false;
  if (existing.category !== extraction.category) return false;
  if (existing.data_type !== extraction.data_type) return false;

  // Grain match: both null = match, both non-null and equal = match
  if (existing.grain != null && extraction.grain != null) {
    return existing.grain === extraction.grain;
  }

  // One null, one not = still a potential match (grain-agnostic data)
  return true;
}

/**
 * Check whether the extraction targets a different location_detail than
 * the existing entry. Used to detect new-location promotions.
 */
function isDifferentLocation(
  existing: KnowledgeEntry,
  extraction: ExtractionForTriage,
): boolean {
  // If both have location detail and they differ, it's a new location
  if (
    existing.location_detail != null &&
    extraction.location_detail != null &&
    existing.location_detail !== extraction.location_detail
  ) {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Main triage function
// ---------------------------------------------------------------------------

/**
 * Decides what to do with a single extraction given existing knowledge.
 *
 * Decision tree:
 * 1. No value (numeric AND text both null) -> discard
 * 2. No matching active knowledge in same FSA/category/data_type/grain -> promote
 * 3. Match found but different location_detail -> promote as new location
 * 4. Match found -> delegate to shouldSupersede:
 *    - supersede   -> return supersede with existing_id
 *    - corroborate -> return corroborate with existing_id
 *    - flag_for_review -> return defer
 *    - no_match    -> promote (supersession engine says no relation)
 */
export function triageExtraction(
  extraction: ExtractionForTriage,
  existingKnowledge: KnowledgeEntry[],
): TriageDecision {
  // Step 1: Discard empty extractions
  if (isEmptyExtraction(extraction)) {
    return {
      action: 'discard',
      reason: 'No numeric or text value present',
      confidence: 'high',
    };
  }

  // Step 2: Find matching entries by identity dimensions
  const matches = existingKnowledge.filter((entry) =>
    isIdentityMatch(entry, extraction),
  );

  if (matches.length === 0) {
    return {
      action: 'promote',
      reason: 'New data point with no existing match',
      confidence: 'high',
    };
  }

  // Step 3: Check for new location promotion
  // If ALL matches have a different location_detail, this is a new location
  const allDifferentLocation = matches.every((entry) =>
    isDifferentLocation(entry, extraction),
  );

  if (allDifferentLocation) {
    return {
      action: 'promote',
      reason: `New location "${extraction.location_detail}" for existing data type`,
      confidence: 'high',
    };
  }

  // Step 4: Delegate to supersession engine for the best-matching entry
  // Prefer entries at the same location
  const sameLocationMatch = matches.find(
    (entry) => !isDifferentLocation(entry, extraction),
  );
  const bestMatch = sameLocationMatch ?? matches[0];

  const incomingData = {
    category: extraction.category,
    data_type: extraction.data_type,
    grain: extraction.grain,
    value_numeric: extraction.value_numeric,
    value_text: extraction.value_text,
    location_detail: extraction.location_detail,
    fsa_code: extraction.fsa_code,
  };

  const supersessionResult = shouldSupersede(bestMatch, incomingData);

  switch (supersessionResult.action) {
    case 'supersede':
      return {
        action: 'supersede',
        reason: supersessionResult.reason,
        existing_id: bestMatch.id,
        confidence: supersessionResult.confidence,
      };

    case 'corroborate':
      return {
        action: 'corroborate',
        reason: supersessionResult.reason,
        existing_id: bestMatch.id,
        confidence: supersessionResult.confidence,
      };

    case 'flag_for_review':
      return {
        action: 'defer',
        reason: supersessionResult.reason,
        existing_id: bestMatch.id,
        confidence: 'low',
      };

    case 'no_match':
      // Supersession engine says no relation — treat as new data
      return {
        action: 'promote',
        reason: `No supersession relationship: ${supersessionResult.reason}`,
        confidence: 'medium',
      };

    default:
      return {
        action: 'defer',
        reason: `Unexpected supersession result: ${supersessionResult.action}`,
        confidence: 'low',
      };
  }
}

// ---------------------------------------------------------------------------
// Summary factory
// ---------------------------------------------------------------------------

/**
 * Creates an empty DailySummary structure for the given date.
 * Populated incrementally as extractions are triaged.
 */
export function createEmptySummary(date: string): DailySummary {
  return {
    date,
    stats: {
      conversations_processed: 0,
      extractions_total: 0,
      promoted: 0,
      corroborated: 0,
      superseded: 0,
      discarded: 0,
      deferred: 0,
    },
    supersession_decisions: [],
    flags_for_review: [],
    patterns_detected: [],
    aging_warnings: [],
    weather_summary: {},
  };
}
