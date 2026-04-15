import { describe, it, expect } from 'vitest';
import { classifyMessage, type ExtractionCandidate } from '@/lib/knowledge/classification';

describe('classifyMessage', () => {
  it('extracts basis report with numeric value', () => {
    const result = classifyMessage(
      'Canola basis at Viterra Weyburn is -42 under today',
      { grain: 'Canola', fsa_code: 'S0A' }
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      category: 'market',
      data_type: 'basis',
      grain: 'Canola',
      value_numeric: -42,
      location_detail: expect.stringContaining('Viterra'),
      confidence: 'reported',
    });
  });

  it('extracts intent signal from rotation mention', () => {
    const result = classifyMessage(
      "I'm thinking about switching to lentils next year",
      { grain: null, fsa_code: 'S0A' }
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      category: 'intent',
      data_type: 'rotation_plan',
      grain: 'Lentils',
      confidence: 'reported',
    });
  });

  it('extracts weather observation', () => {
    const result = classifyMessage(
      'Got 2 inches of rain last night',
      { grain: null, fsa_code: 'T0L' }
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      category: 'weather',
      data_type: 'precipitation',
      value_numeric: 2,
      confidence: 'reported',
    });
  });

  it('returns empty array for non-farming chatter', () => {
    const result = classifyMessage(
      'My dog ate the tractor manual',
      { grain: null, fsa_code: 'S0A' }
    );
    expect(result).toHaveLength(0);
  });

  it('extracts multiple data points from one message', () => {
    const result = classifyMessage(
      'Finished seeding 800 acres of wheat, yield looking like 45 bushels',
      { grain: 'Wheat', fsa_code: 'S0A' }
    );
    expect(result.length).toBeGreaterThanOrEqual(2);
    const types = result.map(r => r.data_type);
    expect(types).toContain('seeding_progress');
    expect(types).toContain('yield_estimate');
  });

  it('extracts input cost data', () => {
    const result = classifyMessage(
      'Urea is $780 per tonne at the co-op',
      { grain: null, fsa_code: 'T0K' }
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      category: 'input_cost',
      data_type: 'fertilizer_price',
      value_numeric: 780,
      confidence: 'reported',
    });
  });

  it('extracts logistics — elevator wait time', () => {
    const result = classifyMessage(
      '3 hour wait at Viterra today',
      { grain: null, fsa_code: 'S0A' }
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      category: 'logistics',
      data_type: 'elevator_wait_time',
      value_numeric: 3,
    });
  });

  it('extracts frost event from weather', () => {
    const result = classifyMessage(
      'Hit -3 this morning, frost warning was right',
      { grain: null, fsa_code: 'T0L' }
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      category: 'weather',
      data_type: 'frost_event',
    });
  });
});
