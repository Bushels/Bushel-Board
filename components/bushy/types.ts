/**
 * Bushy chat types — mirrors iOS Swift models 1:1.
 * See: BushelBoard/Features/Chat/ChatViewModel.swift
 */

// ---------------------------------------------------------------------------
// Source tags & confidence
// ---------------------------------------------------------------------------

export type SourceTag =
  | "your history"
  | "local reports"
  | "posted pricing"
  | "national market"
  | "sponsored";

export type ConfidenceLevel = "Early read" | "Solid read" | "Strong read";

// ---------------------------------------------------------------------------
// Card data models (match iOS structs)
// ---------------------------------------------------------------------------

export interface TrustFooterData {
  cgcFreshness: string;
  futuresFreshness: string;
  localReportCount: number;
  localReportFreshness: string;
  postedPrices?: string;
  confidence: ConfidenceLevel;
}

export interface ReasonBullet {
  text: string;
  sourceTag: SourceTag;
}

export interface MarketSummaryData {
  grain: string;
  stanceBadge: string; // "Bullish +20"
  takeaway: string;
  reasons: ReasonBullet[];
  recommendation: string;
  followUpAsk?: string;
  trustFooter: TrustFooterData;
}

export interface QuickAction {
  label: string;
  icon: string; // Lucide icon name (web equivalent of SF Symbols)
}

export interface RecommendationData {
  headline: string;
  explanation: string;
  actions: QuickAction[];
  trustFooter: TrustFooterData;
}

export interface VerificationPromptData {
  grain: string;
  dataType: string;
  inferredValue: string;
  elevatorName?: string;
  confirmLabel: string;
  denyLabel: string;
  threadId?: string;
}

// ---------------------------------------------------------------------------
// Discriminated union for message content
// ---------------------------------------------------------------------------

export type MessageContent =
  | { type: "plain_text"; text: string }
  | { type: "market_summary"; data: MarketSummaryData }
  | { type: "recommendation"; data: RecommendationData }
  | { type: "verification_prompt"; data: VerificationPromptData }
  | { type: "status_line"; text: string };

// ---------------------------------------------------------------------------
// Chat message (mirrors iOS ChatMessage)
// ---------------------------------------------------------------------------

export type MessageRole = "user" | "analyst" | "status";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  cardData?: MessageContent;
  trustFooter?: TrustFooterData;
}

// ---------------------------------------------------------------------------
// SSE events from chat-completion Edge Function
// ---------------------------------------------------------------------------

export type SSEEvent =
  | { type: "delta"; content: string }
  | { type: "tool_call"; name: string }
  | { type: "tool_result"; name: string; result: unknown }
  | { type: "verification_prompt"; data: ServerVerificationPrompt }
  | { type: "trust_footer"; data: TrustFooterData }
  | { type: "done"; threadId?: string; cardData?: Record<string, unknown> }
  | { type: "error"; message: string };

/** Raw verification prompt from the Edge Function */
export interface ServerVerificationPrompt {
  grain: string;
  dataType: string;
  dataDescription: string;
  prompt: string;
  options: Array<{ label: string; value: string }>;
}

// ---------------------------------------------------------------------------
// Gamified verification labels (matches iOS factory method)
// ---------------------------------------------------------------------------

export function gamifiedLabels(dataType: string): {
  confirm: string;
  deny: string;
} {
  switch (dataType) {
    case "basis":
    case "elevator_price":
    case "input_price":
      return {
        confirm: "This is what I actually paid",
        deny: "I'm just kidding around",
      };
    case "acres_planned":
    case "crop_condition":
      return { confirm: "That's my real number", deny: "Ballpark guess" };
    case "yield_estimate":
      return { confirm: "Actual weigh-up", deny: "Rough estimate" };
    case "seeding_progress":
    case "harvest_progress":
      return { confirm: "That's where I'm at", deny: "Just guessing" };
    default:
      return { confirm: "Yep, that's right", deny: "Not quite" };
  }
}
