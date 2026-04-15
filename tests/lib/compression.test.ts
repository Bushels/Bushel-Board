import { describe, it, expect } from 'vitest';
import { triageExtraction, createEmptySummary, type TriageDecision } from '@/lib/knowledge/compression';
import type { KnowledgeEntry } from '@/lib/knowledge/supersession';

const makeKnowledge = (overrides: Partial<KnowledgeEntry>): KnowledgeEntry => ({
  id: 'existing-1',
  fsa_code: 'S0A',
  category: 'market',
  data_type: 'basis',
  grain: 'Canola',
  value_numeric: -42,
  value_text: null,
  location_detail: 'Viterra Weyburn',
  source_count: 1,
  confidence_level: 'single_report',
  status: 'active',
  last_updated_at: new Date(),
});

describe('triageExtraction', () => {
  it('promotes a new data point with no existing match', () => {
    const decision = triageExtraction(
      {
        category: 'market',
        data_type: 'basis',
        grain: 'Canola',
        fsa_code: 'S0A',
        value_numeric: -42,
        value_text: null,
        location_detail: 'Viterra Weyburn',
        confidence: 'reported',
      },
      []
    );
    expect(decision.action).toBe('promote');
    expect(decision.confidence).toBe('high');
  });

  it('corroborates when existing similar value exists', () => {
    const decision = triageExtraction(
      {
        category: 'market',
        data_type: 'basis',
        grain: 'Canola',
        fsa_code: 'S0A',
        value_numeric: -41,
        value_text: null,
        location_detail: 'Viterra Weyburn',
        confidence: 'reported',
      },
      [makeKnowledge({})]
    );
    expect(decision.action).toBe('corroborate');
    expect(decision.existing_id).toBe('existing-1');
  });

  it('supersedes when value has changed moderately', () => {
    const decision = triageExtraction(
      {
        category: 'market',
        data_type: 'basis',
        grain: 'Canola',
        fsa_code: 'S0A',
        value_numeric: -38,
        value_text: null,
        location_detail: 'Viterra Weyburn',
        confidence: 'reported',
      },
      [makeKnowledge({})]
    );
    expect(decision.action).toBe('supersede');
    expect(decision.existing_id).toBe('existing-1');
  });

  it('defers when large discrepancy (flags for review)', () => {
    const decision = triageExtraction(
      {
        category: 'market',
        data_type: 'basis',
        grain: 'Canola',
        fsa_code: 'S0A',
        value_numeric: -10,
        value_text: null,
        location_detail: 'Viterra Weyburn',
        confidence: 'reported',
      },
      [makeKnowledge({})]
    );
    expect(decision.action).toBe('defer');
    expect(decision.confidence).toBe('low');
  });

  it('discards when no value present', () => {
    const decision = triageExtraction(
      {
        category: 'market',
        data_type: 'basis',
        grain: null,
        fsa_code: 'S0A',
        value_numeric: null,
        value_text: null,
        location_detail: null,
        confidence: 'inferred',
      },
      []
    );
    expect(decision.action).toBe('discard');
  });

  it('promotes when new location for existing data type', () => {
    const decision = triageExtraction(
      {
        category: 'market',
        data_type: 'basis',
        grain: 'Canola',
        fsa_code: 'S0A',
        value_numeric: -38,
        value_text: null,
        location_detail: 'Richardson Yorkton',
        confidence: 'reported',
      },
      [makeKnowledge({ location_detail: 'Viterra Weyburn' })]
    );
    expect(decision.action).toBe('promote');
    expect(decision.reason).toContain('location');
  });
});

describe('createEmptySummary', () => {
  it('creates a valid empty summary structure', () => {
    const summary = createEmptySummary('2026-04-15');
    expect(summary.date).toBe('2026-04-15');
    expect(summary.stats.promoted).toBe(0);
    expect(summary.supersession_decisions).toEqual([]);
    expect(summary.flags_for_review).toEqual([]);
  });
});
