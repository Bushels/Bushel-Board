/**
 * Supersession Engine
 *
 * Decides when new incoming data should replace, corroborate, or flag
 * existing working-memory entries. Rules vary by category:
 *   - market / input_cost: numeric comparison (10% corroborate, 10-30% supersede, >30% flag)
 *   - weather: aggressive supersession across data types within same FSA
 *   - agronomic: same data_type = direct update; cross-type only on season progression
 *   - intent: only superseded by same category + same data_type (never by other categories)
 *   - logistics: same data_type + same location = supersede
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KnowledgeEntry {
  id: string;
  fsa_code: string;
  category: string;
  data_type: string;
  grain: string | null;
  value_numeric: number | null;
  value_text: string | null;
  location_detail: string | null;
  source_count: number;
  confidence_level: string;
  status: string;
  last_updated_at: Date;
}

export interface IncomingData {
  category: string;
  data_type: string;
  grain: string | null;
  value_numeric: number | null;
  value_text: string | null;
  location_detail: string | null;
  fsa_code: string;
}

export interface SupersessionDecision {
  action: 'supersede' | 'corroborate' | 'flag_for_review' | 'no_match';
  decision_type:
    | 'direct_contradiction'
    | 'progression'
    | 'corroboration_upgrade'
    | 'context_staleness'
    | 'none';
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function noMatch(reason: string): SupersessionDecision {
  return { action: 'no_match', decision_type: 'none', confidence: 'high', reason };
}

/**
 * Agronomic season order — later stages supersede earlier ones.
 */
const AGRONOMIC_SEASON_ORDER: string[] = [
  'seeding_progress',
  'crop_condition',
  'harvest_progress',
];

function agronomicStageIndex(dataType: string): number {
  return AGRONOMIC_SEASON_ORDER.indexOf(dataType);
}

/**
 * Percentage difference between two numeric values.
 * Uses absolute-value comparison against the existing value as base.
 * Returns a value in [0, Infinity).
 */
function pctDiff(existing: number, incoming: number): number {
  const base = Math.abs(existing);
  if (base === 0) {
    // If existing is zero, any non-zero incoming is treated as a large diff
    return incoming === 0 ? 0 : 100;
  }
  return (Math.abs(incoming - existing) / base) * 100;
}

// ---------------------------------------------------------------------------
// Category handlers
// ---------------------------------------------------------------------------

function handleMarket(
  existing: KnowledgeEntry,
  incoming: IncomingData,
): SupersessionDecision {
  // Must match on data_type and location
  if (existing.data_type !== incoming.data_type) {
    return noMatch('Different market data types');
  }

  if (existing.location_detail !== incoming.location_detail) {
    return noMatch('Different location within same FSA');
  }

  // Numeric comparison
  if (existing.value_numeric != null && incoming.value_numeric != null) {
    const diff = pctDiff(existing.value_numeric, incoming.value_numeric);

    if (diff <= 5) {
      return {
        action: 'corroborate',
        decision_type: 'corroboration_upgrade',
        confidence: 'high',
        reason: `Values within 5% (${diff.toFixed(1)}% diff) — corroborating`,
      };
    }

    if (diff <= 30) {
      return {
        action: 'supersede',
        decision_type: 'direct_contradiction',
        confidence: 'high',
        reason: `Values differ by ${diff.toFixed(1)}% — superseding with newer data`,
      };
    }

    // > 30% — suspicious, flag for review
    return {
      action: 'flag_for_review',
      decision_type: 'direct_contradiction',
      confidence: 'low',
      reason: `Values differ by ${diff.toFixed(1)}% (>30%) — flagging for review`,
    };
  }

  // Text-only market data at same location + same data_type: supersede
  return {
    action: 'supersede',
    decision_type: 'direct_contradiction',
    confidence: 'medium',
    reason: 'Same market data type and location — superseding text observation',
  };
}

function handleWeather(
  _existing: KnowledgeEntry,
  _incoming: IncomingData,
): SupersessionDecision {
  // Weather aggressively supersedes — any new weather in same FSA replaces old,
  // even across different data types (precipitation → drought_observation, etc.)
  return {
    action: 'supersede',
    decision_type: 'progression',
    confidence: 'high',
    reason: 'Weather data supersedes aggressively within same FSA',
  };
}

function handleAgronomic(
  existing: KnowledgeEntry,
  incoming: IncomingData,
): SupersessionDecision {
  // Same data_type = direct update
  if (existing.data_type === incoming.data_type) {
    return {
      action: 'supersede',
      decision_type: 'direct_contradiction',
      confidence: 'high',
      reason: `Same agronomic data type "${existing.data_type}" — direct update`,
    };
  }

  // Different data_type — only supersedes on season progression
  const existingIdx = agronomicStageIndex(existing.data_type);
  const incomingIdx = agronomicStageIndex(incoming.data_type);

  if (existingIdx >= 0 && incomingIdx >= 0 && incomingIdx > existingIdx) {
    return {
      action: 'supersede',
      decision_type: 'progression',
      confidence: 'high',
      reason: `Season progression: ${existing.data_type} → ${incoming.data_type}`,
    };
  }

  return noMatch('Agronomic data types do not follow season progression order');
}

function handleIntent(
  existing: KnowledgeEntry,
  incoming: IncomingData,
): SupersessionDecision {
  // Intent is only superseded by same category + same data_type
  if (incoming.category !== 'intent') {
    return noMatch('Non-intent data cannot supersede intent entries');
  }

  if (existing.data_type !== incoming.data_type) {
    return noMatch('Different intent data types');
  }

  return {
    action: 'supersede',
    decision_type: 'direct_contradiction',
    confidence: 'medium',
    reason: `Explicit intent change for "${existing.data_type}"`,
  };
}

function handleLogistics(
  existing: KnowledgeEntry,
  incoming: IncomingData,
): SupersessionDecision {
  // Same data_type + same location = supersede
  if (existing.data_type !== incoming.data_type) {
    return noMatch('Different logistics data types');
  }

  if (
    existing.location_detail != null &&
    incoming.location_detail != null &&
    existing.location_detail !== incoming.location_detail
  ) {
    return noMatch('Different logistics locations');
  }

  return {
    action: 'supersede',
    decision_type: 'direct_contradiction',
    confidence: 'high',
    reason: `Same logistics data type "${existing.data_type}" at same facility — superseding`,
  };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function shouldSupersede(
  existing: KnowledgeEntry,
  incoming: IncomingData,
): SupersessionDecision {
  // ---- Global no-match rules ----

  // Different FSA codes → always no_match
  if (existing.fsa_code !== incoming.fsa_code) {
    return noMatch('Different FSA codes');
  }

  // Different category → no_match
  // Exception: weather can supersede across data types (handled inside category)
  if (existing.category !== incoming.category) {
    // Intent is never superseded by a different category
    if (existing.category === 'intent') {
      return noMatch('Non-intent data cannot supersede intent entries');
    }
    return noMatch('Different categories');
  }

  // Different grain (both non-null) → no_match
  if (
    existing.grain != null &&
    incoming.grain != null &&
    existing.grain !== incoming.grain
  ) {
    return noMatch('Different grains');
  }

  // ---- Category-specific routing ----

  switch (existing.category) {
    case 'market':
    case 'input_cost':
      return handleMarket(existing, incoming);

    case 'weather':
      return handleWeather(existing, incoming);

    case 'agronomic':
      return handleAgronomic(existing, incoming);

    case 'intent':
      return handleIntent(existing, incoming);

    case 'logistics':
      return handleLogistics(existing, incoming);

    default:
      // Unknown category — default to supersede if same data_type, else no_match
      if (existing.data_type === incoming.data_type) {
        return {
          action: 'supersede',
          decision_type: 'direct_contradiction',
          confidence: 'medium',
          reason: `Unknown category "${existing.category}" — same data_type, superseding`,
        };
      }
      return noMatch(`Unknown category "${existing.category}" with different data types`);
  }
}
