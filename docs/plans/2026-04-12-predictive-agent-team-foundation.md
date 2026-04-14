# Predictive Agent Team Foundation

Date: 2026-04-12
Status: in progress

Goal
Turn Bushel Board's market-analysis pipeline into a clearer predictive grain-market system where each weekly bull/bear case reads like a farmer-facing market summary, not generic AI commentary.

Why this matters
- Farmers do not need abstract debate output. They need a weekly read on what is helping them, what is hurting them, and whether to haul or hold.
- The current pipeline already has strong data and prompt logic, but the specialist roles were implicit.
- Making the agent team explicit improves consistency and creates a clean base for future calibration and retrospective agents.

Agent team added in this pass
1. Delivery Lead
- Owns the final weekly haul-or-hold framing.

2. Flow Balance Agent
- Reads deliveries, exports, processing, and stocks.
- Answers whether grain is being absorbed or backing up.

3. Basis & Cash Agent
- Keeps the thesis tied to the farmer's cash truth.

4. Logistics Agent
- Weighs receipts, exports, rail, ports, and producer cars for the near-term call.

5. Sentiment & Timing Agent
- Uses X, COT, and momentum as timing modifiers.

6. Calibration Guard
- Prevents contradiction, forces timeline and risk, and keeps confidence disciplined.

7. Grain-specific specialists
- Crush & Oilseed Agent for canola / soybeans / flaxseed
- Specialty Market Agent for oats / peas / lentils / flaxseed / mustard / canary / chickpeas / rye / triticale

Implementation in this pass
- Added shared Bushel Board agent-team definitions for app-side prompt builders.
- Added shared agent-team definitions for Supabase Edge Functions.
- Added a dedicated Retrospective Calibration Agent to the explicit Bushel Board team.
- Added shared market-calibration helpers for prompt injection and outcome scoring.
- Updated analyst prompt builders so the bull/bear case is explicitly framed as the weekly farmer summary.
- Updated analyze-grain-market so production analysis now reads the prior call, injects a retrospective calibration memo, and stores a calibration outcome in `market_analysis.llm_metadata`.
- Added unit tests for the agent roster, calibration helper, and prompt framing.

Next logical agents to add
1. Price Verification Agent
- Verifies futures + cash + basis freshness before publish.

2. Retrospective Calibration Agent
- Compares last week's call versus the next move in cash price and basis.
- Tracks repeat bias by grain.

3. Trigger Watch Agent
- Highlights thesis-breaking events between Thursday data releases.

4. Producer-Car Divergence Agent
- Flags when forward rail demand disagrees with the current thesis.

Definition of done for the next pass
- Retrospective agent writes a weekly accuracy note by grain.
- Price verification agent blocks bullish publish when cash truth does not confirm.
- Trigger watch can push WATCH status when live events break the older weekly read.
