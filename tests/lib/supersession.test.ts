import { describe, it, expect } from 'vitest';
import { shouldSupersede, type SupersessionDecision, type KnowledgeEntry } from '@/lib/knowledge/supersession';

const makeEntry = (overrides: Partial<KnowledgeEntry>): KnowledgeEntry => ({
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
  last_updated_at: new Date('2026-04-10'),
  ...overrides,
});

describe('shouldSupersede', () => {
  it('supersedes same location with newer price — direct contradiction', () => {
    const existing = makeEntry({});
    const incoming = {
      category: 'market' as const,
      data_type: 'basis',
      grain: 'Canola',
      value_numeric: -38,
      value_text: null,
      location_detail: 'Viterra Weyburn',
      fsa_code: 'S0A',
    };
    const decision = shouldSupersede(existing, incoming);
    expect(decision.action).toBe('supersede');
    expect(decision.confidence).toBe('high');
    expect(decision.decision_type).toBe('direct_contradiction');
  });

  it('corroborates when different source reports similar value', () => {
    const existing = makeEntry({ value_numeric: -42 });
    const incoming = {
      category: 'market' as const,
      data_type: 'basis',
      grain: 'Canola',
      value_numeric: -41,
      value_text: null,
      location_detail: 'Viterra Weyburn',
      fsa_code: 'S0A',
    };
    const decision = shouldSupersede(existing, incoming);
    expect(decision.action).toBe('corroborate');
  });

  it('flags conflicting values for review', () => {
    const existing = makeEntry({ value_numeric: -42 });
    const incoming = {
      category: 'market' as const,
      data_type: 'basis',
      grain: 'Canola',
      value_numeric: -28,
      value_text: null,
      location_detail: 'Viterra Weyburn',
      fsa_code: 'S0A',
    };
    const decision = shouldSupersede(existing, incoming);
    expect(decision.action).toBe('flag_for_review');
    expect(decision.confidence).toBe('low');
  });

  it('supersedes weather aggressively', () => {
    const existing = makeEntry({
      category: 'weather',
      data_type: 'precipitation',
      value_numeric: 2,
      value_text: 'Got 2 inches of rain',
      grain: null,
      location_detail: null,
      last_updated_at: new Date('2026-04-12'),
    });
    const incoming = {
      category: 'weather' as const,
      data_type: 'drought_observation',
      grain: null,
      value_numeric: null,
      value_text: 'Been dry since that rain',
      location_detail: null,
      fsa_code: 'S0A',
    };
    const decision = shouldSupersede(existing, incoming);
    expect(decision.action).toBe('supersede');
    expect(decision.decision_type).toBe('progression');
  });

  it('does NOT supersede intent without explicit change', () => {
    const existing = makeEntry({
      category: 'intent',
      data_type: 'rotation_plan',
      value_text: 'thinking about lentils',
      value_numeric: null,
      grain: 'Lentils',
      location_detail: null,
    });
    const incoming = {
      category: 'agronomic' as const,
      data_type: 'seeding_progress',
      grain: 'Wheat',
      value_numeric: 500,
      value_text: null,
      location_detail: null,
      fsa_code: 'S0A',
    };
    const decision = shouldSupersede(existing, incoming);
    expect(decision.action).toBe('no_match');
  });

  it('supersedes logistics at same facility', () => {
    const existing = makeEntry({
      category: 'logistics',
      data_type: 'elevator_capacity',
      value_numeric: null,
      value_text: 'Elevator is full',
      grain: null,
    });
    const incoming = {
      category: 'logistics' as const,
      data_type: 'elevator_capacity',
      grain: null,
      value_numeric: null,
      value_text: 'Elevator taking grain again',
      location_detail: 'Viterra Weyburn',
      fsa_code: 'S0A',
    };
    const decision = shouldSupersede(existing, incoming);
    expect(decision.action).toBe('supersede');
  });

  it('does not match different FSA codes', () => {
    const existing = makeEntry({ fsa_code: 'S0A' });
    const incoming = {
      category: 'market' as const,
      data_type: 'basis',
      grain: 'Canola',
      value_numeric: -38,
      value_text: null,
      location_detail: 'Viterra Weyburn',
      fsa_code: 'T0L',
    };
    const decision = shouldSupersede(existing, incoming);
    expect(decision.action).toBe('no_match');
  });

  it('supersedes agronomic on season progression', () => {
    const existing = makeEntry({
      category: 'agronomic',
      data_type: 'seeding_progress',
      value_numeric: 500,
      value_text: null,
      grain: 'Wheat',
      location_detail: null,
    });
    const incoming = {
      category: 'agronomic' as const,
      data_type: 'harvest_progress',
      grain: 'Wheat',
      value_numeric: 80,
      value_text: null,
      location_detail: null,
      fsa_code: 'S0A',
    };
    const decision = shouldSupersede(existing, incoming);
    expect(decision.action).toBe('supersede');
    expect(decision.decision_type).toBe('progression');
  });
});
