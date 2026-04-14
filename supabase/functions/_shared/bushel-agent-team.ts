export type BushelAgentId =
  | "delivery_lead"
  | "flow_balance"
  | "basis_cash"
  | "logistics_pipe"
  | "sentiment_timing"
  | "calibration_guard"
  | "retrospective_calibration"
  | "crush_oilseed"
  | "specialty_market";

export interface BushelAgentDefinition {
  id: BushelAgentId;
  name: string;
  role: string;
  weeklyQuestion: string;
  priority: "core" | "specialist";
  signalWeight: "primary" | "supporting" | "timing" | "guardrail";
  dataSources: string[];
}

const CORE_AGENT_TEAM: BushelAgentDefinition[] = [
  {
    id: "delivery_lead",
    name: "Delivery Lead",
    role: "Turns the full market read into a plain-language haul-or-hold call for this week.",
    weeklyQuestion: "What should the farmer actually do this week if cash flow is normal?",
    priority: "core",
    signalWeight: "primary",
    dataSources: ["market_analysis", "grain_intelligence", "grain_prices", "viking-l1 summaries"],
  },
  {
    id: "flow_balance",
    name: "Flow Balance Agent",
    role: "Reads deliveries, exports, processing, and stocks to decide whether grain is being absorbed or backing up.",
    weeklyQuestion: "Are the numbers showing grain leaving the system, or piling up in the pipeline?",
    priority: "core",
    signalWeight: "primary",
    dataSources: ["v_grain_yoy_comparison", "v_supply_pipeline", "cgc_observations", "get_pipeline_velocity()"],
  },
  {
    id: "basis_cash",
    name: "Basis & Cash Agent",
    role: "Keeps the thesis grounded in the farmer's real price, not just the futures story.",
    weeklyQuestion: "Is cash or basis working the farmer's way right now, or is the elevator comfortable?",
    priority: "core",
    signalWeight: "primary",
    dataSources: ["grain_prices", "cash bids", "basis snapshots", "local delivery quotes"],
  },
  {
    id: "logistics_pipe",
    name: "Logistics Agent",
    role: "Focuses on rail, ports, receipts, exports, and producer cars for the next 1-4 weeks.",
    weeklyQuestion: "Is the pipe hungry for grain this week, or plugged enough to widen basis?",
    priority: "core",
    signalWeight: "primary",
    dataSources: ["get_logistics_snapshot()", "producer cars", "terminal receipts", "terminal exports", "x_market_signals"],
  },
  {
    id: "sentiment_timing",
    name: "Sentiment & Timing Agent",
    role: "Uses X chatter, COT, and momentum as timing modifiers rather than the main thesis driver.",
    weeklyQuestion: "Is positioning or sentiment stretched enough to speed up or delay action?",
    priority: "core",
    signalWeight: "timing",
    dataSources: ["x_market_signals", "cftc_cot_positions", "grain_prices", "USDA export sales"],
  },
  {
    id: "retrospective_calibration",
    name: "Retrospective Calibration Agent",
    role: "Reviews last week's call against fresh price follow-through so the new thesis learns from recent hits and misses.",
    weeklyQuestion: "Did last week's Bushel Board call work, miss, or stay unresolved, and how should that change this week's conviction?",
    priority: "core",
    signalWeight: "guardrail",
    dataSources: ["prior market_analysis rows", "grain_prices", "weekly price follow-through", "review triggers"],
  },
  {
    id: "calibration_guard",
    name: "Calibration Guard",
    role: "Prevents contradictory or overconfident calls and forces a trigger, timeline, and main risk.",
    weeklyQuestion: "Does the recommendation match the evidence chain, cash price, and this week's uncertainty?",
    priority: "core",
    signalWeight: "guardrail",
    dataSources: ["prior market_analysis rows", "score_trajectory", "grain_prices", "validation rules"],
  },
];

const OILSEED_SPECIALIST: BushelAgentDefinition = {
  id: "crush_oilseed",
  name: "Crush & Oilseed Agent",
  role: "Tracks crush demand, vegetable oil links, and processor appetite for oilseed markets.",
  weeklyQuestion: "Are crushers or the broader oilseed complex putting a floor under this market?",
  priority: "specialist",
  signalWeight: "supporting",
  dataSources: ["process data", "v_supply_pipeline", "soy complex pricing", "processor bids"],
};

const SPECIALTY_MARKET_AGENT: BushelAgentDefinition = {
  id: "specialty_market",
  name: "Specialty Market Agent",
  role: "Handles thin, policy-driven, or container-driven markets where futures are weak or missing.",
  weeklyQuestion: "Is this grain trading on niche demand, policy, or thin liquidity instead of broad futures flow?",
  priority: "specialist",
  signalWeight: "supporting",
  dataSources: ["policy news", "container/logistics signals", "buyer programs", "specialty cash bids"],
};

const OILSEED_GRAINS = new Set(["Canola", "Soybeans", "Flaxseed"]);
const SPECIALTY_GRAINS = new Set([
  "Oats",
  "Peas",
  "Lentils",
  "Flaxseed",
  "Mustard Seed",
  "Canary Seed",
  "Chickpeas",
  "Rye",
  "Triticale",
]);

export function getBushelAgentTeam(grain: string): BushelAgentDefinition[] {
  const team = [...CORE_AGENT_TEAM];

  if (OILSEED_GRAINS.has(grain)) {
    team.push(OILSEED_SPECIALIST);
  }

  if (SPECIALTY_GRAINS.has(grain)) {
    team.push(SPECIALTY_MARKET_AGENT);
  }

  return team;
}

export function buildBushelAgentTeamBrief(grain: string): string {
  const team = getBushelAgentTeam(grain);
  const lines = team.map((agent) => {
    const sources = agent.dataSources.join(", ");
    return `- ${agent.name} [${agent.signalWeight}]: ${agent.role} Weekly question: ${agent.weeklyQuestion} Sources: ${sources}.`;
  });

  return `## Bushel Board Agent Team
Treat Bushel Board as a predictive grain market for prairie farmers. The bull case and bear case are not debate theatre — they are the weekly summary of what is happening for the farmer, what is working for them, and what is working against them right now.

Use this specialist agent team when forming the thesis for ${grain}:
${lines.join("\n")}

Resolution rules:
- The Delivery Lead writes the final farmer-facing call, but it must respect the Cash & Basis Agent and Logistics Agent before sounding bullish.
- The Sentiment & Timing Agent can change timing, not the main thesis, unless live signals clearly break the older official read.
- The Retrospective Calibration Agent compares last week's call with fresh price follow-through before this week's conviction is locked in.
- The Calibration Guard must force a review trigger, a risk window, and a contradiction check before the thesis is final.
- If the agents disagree, resolve the disagreement explicitly and publish one weekly view.`;
}
