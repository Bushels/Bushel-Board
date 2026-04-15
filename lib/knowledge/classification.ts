/**
 * Knowledge Engine — Classification & Extraction
 *
 * First-pass classifier that extracts structured farming data from chat messages.
 * Uses regex pattern matching for clear-cut cases (basis prices, yield estimates,
 * weather observations, input costs, logistics, intent signals).
 *
 * Pure TypeScript — no database calls, no external APIs.
 * Ambiguous cases are left for the LLM to handle downstream.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExtractionCandidate {
  category: 'market' | 'agronomic' | 'weather' | 'intent' | 'logistics' | 'input_cost';
  data_type: string;
  grain: string | null;
  value_numeric: number | null;
  value_text: string | null;
  location_detail: string | null;
  confidence: 'reported' | 'inferred';
}

export interface MessageContext {
  grain: string | null;
  fsa_code: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GRAIN_NAMES = [
  'Wheat',
  'Canola',
  'Barley',
  'Oats',
  'Flax',
  'Lentils',
  'Peas',
  'Soybeans',
  'Mustard',
  'Rye',
  'Canaryseed',
  'Corn',
  'Sunflower',
  'Chickpeas',
  'Fababeans',
  'Triticale',
] as const;

const ELEVATOR_NAMES = [
  'Viterra',
  'Richardson',
  'Cargill',
  'G3',
  'P&H',
  'Parrish & Heimbecker',
  'Bunge',
  'AGT',
  'co-op',
  'Co-op',
  'Pioneer',
  'Louis Dreyfus',
  'Paterson',
] as const;

const FERTILIZER_NAMES = [
  'urea',
  'anhydrous',
  'MAP',
  'DAP',
  'potash',
  'glyphosate',
  'phosphate',
  'nitrogen',
  'ammonium sulphate',
  'ammonium sulfate',
  'UAN',
] as const;

const CHEMICAL_NAMES = [
  'roundup',
  'liberty',
  'herbicide',
  'fungicide',
  'insecticide',
  'pre-seed',
  'pre-emergent',
  'desiccant',
] as const;

const SEED_KEYWORDS = ['seed', 'seed cost', 'seed price', 'certified seed'] as const;

const FUEL_KEYWORDS = ['diesel', 'fuel', 'gas'] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/**
 * Detect which grain is referenced in a message.
 * Falls back to the conversation's grain context if no explicit mention found.
 */
export function detectGrain(msg: string, ctx: MessageContext): string | null {
  const lower = msg.toLowerCase();
  for (const g of GRAIN_NAMES) {
    if (lower.includes(g.toLowerCase())) {
      return g;
    }
  }
  return ctx.grain;
}

/**
 * Extract an elevator/facility name from the message.
 */
export function extractElevatorName(msg: string): string | null {
  for (const name of ELEVATOR_NAMES) {
    const idx = msg.toLowerCase().indexOf(name.toLowerCase());
    if (idx !== -1) {
      // Grab the elevator name plus any trailing word (e.g., "Viterra Weyburn")
      const afterIdx = idx + name.length;
      const rest = msg.slice(afterIdx);
      const trailingWord = rest.match(/^\s+([A-Z][a-z]+)/);
      if (trailingWord) {
        return msg.slice(idx, afterIdx) + ' ' + trailingWord[1];
      }
      return msg.slice(idx, afterIdx);
    }
  }
  return null;
}

function makeCandidate(partial: Partial<ExtractionCandidate> & Pick<ExtractionCandidate, 'category' | 'data_type'>): ExtractionCandidate {
  return {
    grain: null,
    value_numeric: null,
    value_text: null,
    location_detail: null,
    confidence: 'reported',
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// Pattern matchers
// ---------------------------------------------------------------------------

/**
 * Extract basis price mentions.
 * Matches patterns like:
 *   "basis is -42", "basis at Viterra is -42 under", "basis -$30"
 */
function extractBasis(msg: string, ctx: MessageContext): ExtractionCandidate[] {
  const results: ExtractionCandidate[] = [];

  // Match "basis" followed eventually by a signed number
  const basisPattern = /basis\b.*?([+-]?\$?\s*-?\d+(?:\.\d+)?)/i;
  const match = msg.match(basisPattern);
  if (match) {
    const rawValue = match[1].replace(/[\$\s]/g, '');
    const value = parseFloat(rawValue);
    if (!isNaN(value)) {
      const elevator = extractElevatorName(msg);
      results.push(
        makeCandidate({
          category: 'market',
          data_type: 'basis',
          grain: detectGrain(msg, ctx),
          value_numeric: value,
          location_detail: elevator,
          confidence: 'reported',
        })
      );
    }
  }

  return results;
}

/**
 * Extract price mentions for grain or input costs.
 * Matches "$14.20 for canola", "$780/tonne", "$X per bushel", etc.
 * Classifies as input_cost when fertilizer/chemical/seed/fuel keywords present.
 */
function extractPrice(msg: string, ctx: MessageContext): ExtractionCandidate[] {
  const results: ExtractionCandidate[] = [];
  const lower = msg.toLowerCase();

  // Match dollar amounts: "$14.20", "$780/tonne", "$6.50 per bushel"
  const pricePattern = /\$\s*(\d+(?:[,]\d{3})*(?:\.\d+)?)\s*(?:\/|per\s+)?(tonne|ton|bushel|bu|acre|ac|lb|bag|litre|liter|gal(?:lon)?)?/gi;
  let match: RegExpExecArray | null;

  while ((match = pricePattern.exec(msg)) !== null) {
    const value = parseFloat(match[1].replace(/,/g, ''));
    if (isNaN(value)) continue;

    const unit = match[2] ? match[2].toLowerCase() : null;

    // Check if this is an input cost (fertilizer, chemical, seed, fuel)
    const isFertilizer = FERTILIZER_NAMES.some(f => lower.includes(f.toLowerCase()));
    const isChemical = CHEMICAL_NAMES.some(c => lower.includes(c.toLowerCase()));
    const isSeed = SEED_KEYWORDS.some(s => lower.includes(s.toLowerCase()));
    const isFuel = FUEL_KEYWORDS.some(f => lower.includes(f.toLowerCase()));

    if (isFertilizer) {
      results.push(
        makeCandidate({
          category: 'input_cost',
          data_type: 'fertilizer_price',
          grain: null,
          value_numeric: value,
          value_text: unit ? `per ${unit}` : null,
          location_detail: extractElevatorName(msg),
          confidence: 'reported',
        })
      );
    } else if (isChemical) {
      results.push(
        makeCandidate({
          category: 'input_cost',
          data_type: 'chemical_price',
          grain: null,
          value_numeric: value,
          value_text: unit ? `per ${unit}` : null,
          location_detail: extractElevatorName(msg),
          confidence: 'reported',
        })
      );
    } else if (isSeed) {
      results.push(
        makeCandidate({
          category: 'input_cost',
          data_type: 'seed_price',
          grain: detectGrain(msg, ctx),
          value_numeric: value,
          value_text: unit ? `per ${unit}` : null,
          location_detail: null,
          confidence: 'reported',
        })
      );
    } else if (isFuel) {
      results.push(
        makeCandidate({
          category: 'input_cost',
          data_type: 'fuel_price',
          grain: null,
          value_numeric: value,
          value_text: unit ? `per ${unit}` : null,
          location_detail: null,
          confidence: 'reported',
        })
      );
    } else {
      // Generic grain price
      results.push(
        makeCandidate({
          category: 'market',
          data_type: 'price',
          grain: detectGrain(msg, ctx),
          value_numeric: value,
          value_text: unit ? `per ${unit}` : null,
          location_detail: extractElevatorName(msg),
          confidence: 'reported',
        })
      );
    }
  }

  return results;
}

/**
 * Extract weather observations: precipitation, frost, drought, heat stress.
 */
function extractWeather(msg: string, _ctx: MessageContext): ExtractionCandidate[] {
  const results: ExtractionCandidate[] = [];
  const lower = msg.toLowerCase();

  // Precipitation: "2 inches of rain", "got 50mm", "1.5 inches rain"
  const precipPattern = /(\d+(?:\.\d+)?)\s*(?:inches?|in\.?|mm|cm)\s*(?:of\s+)?(?:rain|precip|moisture|snow)/i;
  const precipMatch = msg.match(precipPattern);
  if (precipMatch) {
    results.push(
      makeCandidate({
        category: 'weather',
        data_type: 'precipitation',
        value_numeric: parseFloat(precipMatch[1]),
        value_text: precipMatch[0],
        confidence: 'reported',
      })
    );
  }

  // Also match "got X inches of rain" pattern (number before "inches")
  if (!precipMatch) {
    const gotRainPattern = /(?:got|received|had)\s+(\d+(?:\.\d+)?)\s*(?:inches?|in\.?|mm|cm)\s+(?:of\s+)?(?:rain|precip|moisture|snow)/i;
    const gotMatch = msg.match(gotRainPattern);
    if (gotMatch) {
      results.push(
        makeCandidate({
          category: 'weather',
          data_type: 'precipitation',
          value_numeric: parseFloat(gotMatch[1]),
          value_text: gotMatch[0],
          confidence: 'reported',
        })
      );
    }
  }

  // Frost events: negative temps or "frost" keyword
  const frostTempPattern = /(?:hit|dropped?\s+to|reached|got(?:\s+down)?\s+to)\s+(-\d+(?:\.\d+)?)/i;
  const frostMatch = msg.match(frostTempPattern);
  const hasFrostKeyword = /frost|freeze|freezing/i.test(lower);
  if (frostMatch || hasFrostKeyword) {
    results.push(
      makeCandidate({
        category: 'weather',
        data_type: 'frost_event',
        value_numeric: frostMatch ? parseFloat(frostMatch[1]) : null,
        value_text: frostMatch ? `${frostMatch[1]} degrees` : 'frost reported',
        confidence: 'reported',
      })
    );
  }

  // Drought mentions
  if (/drought|bone\s*dry|no\s+rain|parched|dried?\s+out/i.test(lower)) {
    results.push(
      makeCandidate({
        category: 'weather',
        data_type: 'drought',
        value_text: 'drought conditions reported',
        confidence: 'reported',
      })
    );
  }

  // Heat stress
  const heatPattern = /(\d+)\s*(?:degrees?|°|C|celsius)?\s*(?:today|this\s+week|yesterday)?/i;
  if (/heat\s*stress|extreme\s*heat|scorching|too\s+hot/i.test(lower)) {
    const heatMatch = msg.match(heatPattern);
    results.push(
      makeCandidate({
        category: 'weather',
        data_type: 'heat_stress',
        value_numeric: heatMatch ? parseFloat(heatMatch[1]) : null,
        value_text: 'heat stress reported',
        confidence: 'reported',
      })
    );
  }

  return results;
}

/**
 * Extract agronomic data: seeding progress, yield estimates, crop conditions, pest/disease, acres.
 */
function extractAgronomic(msg: string, ctx: MessageContext): ExtractionCandidate[] {
  const results: ExtractionCandidate[] = [];
  const lower = msg.toLowerCase();

  // Seeding progress: "seeded 800 acres", "finished seeding 1200 acres of wheat"
  const seedingPattern = /(?:seed(?:ed|ing)|plant(?:ed|ing)|put\s+in)\s+(\d+(?:,\d{3})*)\s*(?:acres?|ac)/i;
  const seedingMatch = msg.match(seedingPattern);
  if (seedingMatch) {
    results.push(
      makeCandidate({
        category: 'agronomic',
        data_type: 'seeding_progress',
        grain: detectGrain(msg, ctx),
        value_numeric: parseFloat(seedingMatch[1].replace(/,/g, '')),
        value_text: `${seedingMatch[1]} acres seeded`,
        confidence: 'reported',
      })
    );
  }

  // Also catch "finished seeding X acres" where the order is different
  if (!seedingMatch) {
    const finishedPattern = /(?:finished|done|completed)\s+seed(?:ing)?\s+(\d+(?:,\d{3})*)\s*(?:acres?|ac)?/i;
    const finishedMatch = msg.match(finishedPattern);
    if (finishedMatch) {
      results.push(
        makeCandidate({
          category: 'agronomic',
          data_type: 'seeding_progress',
          grain: detectGrain(msg, ctx),
          value_numeric: parseFloat(finishedMatch[1].replace(/,/g, '')),
          value_text: `${finishedMatch[1]} acres seeded`,
          confidence: 'reported',
        })
      );
    }
  }

  // Yield estimates: "45 bushels per acre", "yield looking like 45 bushels", "averaging 38 bu"
  const yieldPattern = /(?:yield(?:ing|s)?|averag(?:ing|e)|look(?:ing|s)?\s+like|making|doing|getting)\s+(?:about\s+|around\s+|roughly\s+)?(\d+(?:\.\d+)?)\s*(?:bu(?:shels?)?|bushels?)/i;
  const yieldMatch = msg.match(yieldPattern);
  if (yieldMatch) {
    results.push(
      makeCandidate({
        category: 'agronomic',
        data_type: 'yield_estimate',
        grain: detectGrain(msg, ctx),
        value_numeric: parseFloat(yieldMatch[1]),
        value_text: `${yieldMatch[1]} bu/ac`,
        confidence: 'reported',
      })
    );
  }

  // Standalone yield pattern: "X bushels" without explicit yield verb but with seeding context
  if (!yieldMatch && seedingMatch) {
    const standaloneYield = /(\d+(?:\.\d+)?)\s*(?:bu(?:shels?)?|bushels?)/i;
    const standaloneMatch = msg.match(standaloneYield);
    if (standaloneMatch) {
      results.push(
        makeCandidate({
          category: 'agronomic',
          data_type: 'yield_estimate',
          grain: detectGrain(msg, ctx),
          value_numeric: parseFloat(standaloneMatch[1]),
          value_text: `${standaloneMatch[1]} bu/ac`,
          confidence: 'inferred',
        })
      );
    }
  }

  // Crop condition: "crop looks good/bad/excellent/poor/stressed"
  const conditionPattern = /crop(?:s)?\s+(?:is|are|look(?:s|ing)?)\s+(excellent|great|good|fair|poor|terrible|stressed|struggling|strong|thin|thick)/i;
  const conditionMatch = msg.match(conditionPattern);
  if (conditionMatch) {
    results.push(
      makeCandidate({
        category: 'agronomic',
        data_type: 'crop_condition',
        grain: detectGrain(msg, ctx),
        value_text: conditionMatch[1].toLowerCase(),
        confidence: 'reported',
      })
    );
  }

  // Pest/disease: "grasshoppers", "fusarium", "sclerotinia", "blackleg", "aphids"
  const pestKeywords = /grasshopper|flea\s*beetle|aphid|cutworm|bertha\s*armyworm|wheat\s*midge|sawfly/i;
  const diseaseKeywords = /fusarium|sclerotinia|blackleg|clubroot|rust|ergot|smut|blight|mildew|aster\s*yellows/i;
  if (pestKeywords.test(lower)) {
    results.push(
      makeCandidate({
        category: 'agronomic',
        data_type: 'pest_report',
        grain: detectGrain(msg, ctx),
        value_text: msg,
        confidence: 'reported',
      })
    );
  }
  if (diseaseKeywords.test(lower)) {
    results.push(
      makeCandidate({
        category: 'agronomic',
        data_type: 'disease_report',
        grain: detectGrain(msg, ctx),
        value_text: msg,
        confidence: 'reported',
      })
    );
  }

  // Harvest progress: "harvested 500 acres", "combining", "swathing"
  const harvestPattern = /(?:harvest(?:ed|ing)?|combin(?:ed|ing)|swath(?:ed|ing))\s+(\d+(?:,\d{3})*)\s*(?:acres?|ac)/i;
  const harvestMatch = msg.match(harvestPattern);
  if (harvestMatch) {
    results.push(
      makeCandidate({
        category: 'agronomic',
        data_type: 'harvest_progress',
        grain: detectGrain(msg, ctx),
        value_numeric: parseFloat(harvestMatch[1].replace(/,/g, '')),
        value_text: `${harvestMatch[1]} acres harvested`,
        confidence: 'reported',
      })
    );
  }

  return results;
}

/**
 * Extract intent signals: rotation plans, marketing plans, expansion/contraction.
 */
function extractIntent(msg: string, ctx: MessageContext): ExtractionCandidate[] {
  const results: ExtractionCandidate[] = [];
  const lower = msg.toLowerCase();

  // Rotation plans: "switching to lentils", "going to grow peas", "dropping canola"
  const rotationPattern = /(?:switch(?:ing)?\s+to|go(?:ing)?\s+(?:to\s+)?(?:grow|plant|seed)|try(?:ing)?\s+|mov(?:ing|e)\s+(?:to|into)|add(?:ing)?\s+|dropp(?:ing|ed)\s+|replac(?:ing|e)\s+(?:\w+\s+)?with)\s+/i;
  if (rotationPattern.test(lower)) {
    // Find which grain they're switching to
    const grain = detectGrainFromRotation(msg);
    if (grain) {
      results.push(
        makeCandidate({
          category: 'intent',
          data_type: 'rotation_plan',
          grain,
          value_text: msg,
          confidence: 'reported',
        })
      );
    }
  }

  // Marketing plans: "going to sell", "holding my wheat", "booking contracts"
  const marketingPattern = /(?:going\s+to\s+sell|plan(?:ning)?\s+to\s+sell|hold(?:ing)?\s+(?:my\s+)?|booking?\s+contracts?|forward\s+contract|lock(?:ing)?\s+in)/i;
  if (marketingPattern.test(lower)) {
    results.push(
      makeCandidate({
        category: 'intent',
        data_type: 'marketing_plan',
        grain: detectGrain(msg, ctx),
        value_text: msg,
        confidence: 'reported',
      })
    );
  }

  // Expansion / contraction: "adding more acres", "cutting back", "expanding"
  const expansionPattern = /(?:add(?:ing)?\s+(?:more\s+)?acres|expand(?:ing)?|increas(?:ing|e)\s+(?:my\s+)?acres|cut(?:ting)?\s+back|reduc(?:ing|e)\s+(?:my\s+)?acres|shrink(?:ing)?)/i;
  if (expansionPattern.test(lower)) {
    const isExpanding = /add|expand|increas/i.test(lower);
    results.push(
      makeCandidate({
        category: 'intent',
        data_type: isExpanding ? 'expansion' : 'contraction',
        grain: detectGrain(msg, ctx),
        value_text: msg,
        confidence: 'reported',
      })
    );
  }

  return results;
}

/**
 * For rotation intent, detect the grain being switched TO.
 * Scans the full message for any grain name after rotation keywords.
 */
function detectGrainFromRotation(msg: string): string | null {
  const lower = msg.toLowerCase();
  for (const g of GRAIN_NAMES) {
    if (lower.includes(g.toLowerCase())) {
      return g;
    }
  }
  return null;
}

/**
 * Extract logistics data: elevator wait times, capacity, trucking.
 */
function extractLogistics(msg: string, _ctx: MessageContext): ExtractionCandidate[] {
  const results: ExtractionCandidate[] = [];
  const lower = msg.toLowerCase();

  // Elevator wait time: "3 hour wait", "waited 2 hours", "45 minute wait"
  const hourWaitPattern = /(\d+(?:\.\d+)?)\s*(?:hour|hr)s?\s*(?:wait|line|lineup|queue)/i;
  const waitedHoursPattern = /(?:wait(?:ed|ing)?|line|lineup|queue)\s+(?:for\s+)?(\d+(?:\.\d+)?)\s*(?:hour|hr)s?/i;
  const minuteWaitPattern = /(\d+)\s*(?:minute|min)s?\s*(?:wait|line|lineup|queue)/i;

  const hourMatch = msg.match(hourWaitPattern) || msg.match(waitedHoursPattern);
  const minuteMatch = msg.match(minuteWaitPattern);

  if (hourMatch) {
    results.push(
      makeCandidate({
        category: 'logistics',
        data_type: 'elevator_wait_time',
        value_numeric: parseFloat(hourMatch[1]),
        value_text: `${hourMatch[1]} hours`,
        location_detail: extractElevatorName(msg),
        confidence: 'reported',
      })
    );
  } else if (minuteMatch) {
    results.push(
      makeCandidate({
        category: 'logistics',
        data_type: 'elevator_wait_time',
        value_numeric: parseFloat(minuteMatch[1]) / 60,
        value_text: `${minuteMatch[1]} minutes`,
        location_detail: extractElevatorName(msg),
        confidence: 'reported',
      })
    );
  }

  // Capacity: "elevator is full", "no room", "not taking"
  if (/(?:elevator|bin)\s+(?:is\s+)?(?:full|plugged)|no\s+room|not\s+tak(?:ing|e)|shut\s+(?:off|down)|can'?t\s+deliver/i.test(lower)) {
    results.push(
      makeCandidate({
        category: 'logistics',
        data_type: 'capacity_constraint',
        value_text: 'capacity constraint reported',
        location_detail: extractElevatorName(msg),
        confidence: 'reported',
      })
    );
  }

  // Trucking: "trucking rates", "freight cost"
  const truckingPattern = /(?:truck(?:ing)?|freight|hauling)\s+(?:rate|cost|price)s?\s+(?:(?:is|are|at)\s+)?\$?(\d+(?:\.\d+)?)/i;
  const truckMatch = msg.match(truckingPattern);
  if (truckMatch) {
    results.push(
      makeCandidate({
        category: 'logistics',
        data_type: 'trucking_rate',
        value_numeric: parseFloat(truckMatch[1]),
        value_text: `$${truckMatch[1]}`,
        confidence: 'reported',
      })
    );
  }

  return results;
}

// ---------------------------------------------------------------------------
// Main classifier
// ---------------------------------------------------------------------------

/**
 * Classify a chat message and extract structured farming data.
 *
 * Returns zero or more ExtractionCandidate objects.
 * A message can produce ZERO extractions (non-farming chatter) or
 * MULTIPLE extractions (combined data points).
 */
export function classifyMessage(message: string, context: MessageContext): ExtractionCandidate[] {
  const candidates: ExtractionCandidate[] = [];

  // Track which numeric values have already been claimed by a matcher
  // to avoid double-counting (e.g., basis matcher claims -42, price matcher skips it)
  const basisResults = extractBasis(message, context);
  candidates.push(...basisResults);

  // Only run price extraction if basis didn't already match
  // (avoids double-counting the same numeric value)
  if (basisResults.length === 0) {
    candidates.push(...extractPrice(message, context));
  }

  candidates.push(...extractWeather(message, context));
  candidates.push(...extractAgronomic(message, context));
  candidates.push(...extractIntent(message, context));
  candidates.push(...extractLogistics(message, context));

  return candidates;
}
