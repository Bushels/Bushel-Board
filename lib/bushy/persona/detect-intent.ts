// WS5 Task 5.8 — Bushy chat harness
// Intent detection. Keyword/regex MVP — cheap, deterministic, no LLM cost.
// A Phase-2 upgrade can swap in a small embeddings model for semantic
// classification.
//
// Contract: given the user's current message + prior chat history, return
// up to 2 PersonaTopic keys ordered by priority. The system-prompt composer
// will include the matching PERSONA_L1 chunks (~800 tokens each) so the
// model has the right persona context for this turn.
//
// Capping at 2 topics keeps the prompt size bounded — 7 topics × 800
// tokens would bloat past the cache budget.
//
// The rules below encode the design doc Section 5 matrix of triggers.

import type { ChatMessage } from "../adapters/types";
import type { PersonaTopic } from "./persona-l0";

const MAX_TOPICS_PER_TURN = 2;
const EARLY_TURN_THRESHOLD = 3;

export function detectIntent(
  message: string,
  history: ChatMessage[],
): PersonaTopic[] {
  // Priority ordering matters — when multiple rules fire, the 2-topic
  // cap preserves the FIRST matches. Specific/actionable signals come
  // before framing (opening_a_conversation) so a first-turn "should I
  // haul?" surfaces hard-advice context, not just opener context.
  const topics: PersonaTopic[] = [];
  const lower = message.toLowerCase();

  // Rule 1: Disagreement markers. Strongest intent signal — if the user
  // is pushing back we MUST bring the Patterson/Voss safety toolkit.
  // "bullshit" is colloquial but common on the prairie; include explicitly.
  if (/\b(wrong|mistake|disagree|bullshit|bs)\b/.test(lower)) {
    push(topics, "handling_disagreement");
  }

  // Rule 2: Hold/haul/sell decisions — hard-advice territory. The Most
  // Important questions Bushy answers; the model needs the Patterson/
  // Cabane "recommend without preaching" context.
  if (/\b(hold|haul|sell|wait|when should i)\b/.test(lower)) {
    push(topics, "delivering_hard_advice");
  }

  // Rule 3: Prices/costs/inputs — gamified data-share moment. The model
  // should remember this is an information-trade opportunity.
  if (/\b(price|paid|cost|fertilizer|seed|chemical)\b/.test(lower)) {
    push(topics, "negotiating_data_share");
  }

  // Rule 4: Early-turn questioning. A "?" in the first 3 turns signals
  // the model should apply calibrated-question patterns (Voss) rather
  // than answering flatly. Lower priority than specific intent rules.
  if (/\?\s*$/.test(message) && history.length < EARLY_TURN_THRESHOLD) {
    push(topics, "gathering_information");
  }

  // Rule 5: First-turn opener. Added last so it only surfaces when no
  // stronger intent signal occupied both slots.
  if (history.length === 0) {
    push(topics, "opening_a_conversation");
  }

  // Fallback: if nothing matched, default to rapport-building. Keeps
  // tone warm rather than letting the model hallucinate a topic.
  if (topics.length === 0) {
    topics.push("building_rapport");
  }

  return topics.slice(0, MAX_TOPICS_PER_TURN);
}

/** Push without duplicates. */
function push(arr: PersonaTopic[], t: PersonaTopic): void {
  if (!arr.includes(t)) arr.push(t);
}
