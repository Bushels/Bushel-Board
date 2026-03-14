# Farmer Advisor Chat & Memory - Design Document

**Date:** 2026-03-13
**Status:** Proposed
**Feature Track:** #21
**Implementation:** `docs/plans/2026-03-13-farmer-advisor-chat-implementation.md`

## Overview

Add a global farmer advisor that is available from any authenticated dashboard page through a compact floating launcher. The advisor should answer contextual farm and grain marketing questions using Step 3.5 Flash, the farmer's own data, the latest market recommendations, and retrieved grain marketing knowledge.

The practical outcome for the farmer is simple: instead of hunting through multiple pages, they can ask "What should I move this week?" or "Why are you bullish canola for my farm?" and get an answer grounded in their position, the latest market evidence, and clear source timing.

## Problem

Bushel Board already computes market intelligence, farm summaries, peer percentiles, and delivery history, but a farmer still has to piece those signals together manually.

Current gaps:
- There is no always-available way to ask follow-up questions from the page the farmer is already on.
- The weekly summary is one-way communication. The farmer cannot challenge the recommendation or ask for clarification.
- There is no safe per-farmer memory layer for stable preferences like concise answers, focus grains, or risk framing.
- A shared agent like Hermes introduces avoidable cross-user memory risk right now.

## Goals

1. Add a floating advisor launcher that is available on all authenticated dashboard pages without taking over the layout.
2. Let farmers ask contextual questions from Overview, Grain Detail, and My Farm.
3. Keep all chat reads strictly user-scoped and read-only against production farm and market data.
4. Support a narrow, safe memory layer for explicit preferences and stable farm context.
5. Ground answers in the existing recommendation stack, source timing rules, and retrieved grain marketing knowledge.
6. Keep the system understandable enough that every answer can explain why it said what it said.

## Non-Goals

- No cross-farmer community chat.
- No direct action-taking from chat. The advisor will not edit crop plans, deliveries, contracts, or settings.
- No autonomous self-learning prompt edits.
- No Hermes integration in v1.
- No always-open full-page assistant UI.

## Product Principle

This feature is not a generic chatbot. It is a farm decision-support assistant.

The advisor should answer questions in this order:
1. What does the market signal say?
2. What is this farmer's position?
3. What is the likely next action?
4. What evidence supports that call?
5. What could change the call?

## UX Strategy

### Entry Point

- Mount the advisor in `app/(dashboard)/layout.tsx` so it is present across authenticated dashboard routes.
- Desktop: compact floating launcher at bottom-right.
- Mobile: compact floating launcher above the safe-area inset at bottom-right.
- The launcher should not appear on marketing or auth pages.

### Visual Footprint

- Collapsed state should use a single rounded canola-accent button with a short label such as "Ask Bushel Board".
- The launcher should occupy less space than the current freshness pill and should not overlap key footer controls.
- Avoid persistent sidebars. The advisor should stay hidden until opened.

### Open State

- Desktop: open into a right-side sheet using the existing sheet pattern already used for evidence drawers.
- Mobile: open into a full-height bottom sheet / full-screen sheet.
- Keep a sticky header with:
  - advisor title
  - current page context chip
  - "new chat" action
- Keep the composer fixed to the bottom.

### Context Handling

- The advisor should know the current page automatically.
- Example route contexts:
  - Overview
  - My Farm
  - Grain: Canola
  - Grain: Wheat
- The UI should show the current context so the farmer knows what data the answer is anchored to.
- Provide 2-4 context-aware quick prompts when the sheet opens.

### Answer Shape

Every answer should favor scanability:
- short thesis sentence first
- 2-4 bullets for evidence
- one recommendation block
- one "what could change this" block
- source timing notes when relevant

### Memory UX

- v1 memory should be invisible unless it helps the answer.
- If the system uses a preference or stored fact, it should be explainable.
- Do not anthropomorphize the system as "learning your personality". Frame it as "remembering your preferences and recurring farm context."

## System Architecture

```text
AdvisorDock (client UI in dashboard layout)
  -> /api/advisor/chat (Next.js route handler)
      -> createServerClient() gets authenticated user
      -> fetches user-scoped context via query layer / RPCs
      -> retrieves approved memory items
      -> retrieves relevant knowledge chunks
      -> calls Step 3.5 Flash via OpenRouter
      -> stores user + assistant messages
      -> returns structured answer + citations
```

### Why a Next.js route instead of a new public chat function

- The web app already has authenticated user context via cookies.
- User-scoped reads are simpler in a server route than in a public chat endpoint.
- Streaming and UI request handling fit naturally in Next.js.
- It keeps the chat surface close to the app while leaving the weekly intelligence pipeline in Supabase Edge Functions.

## Data Sources Used by the Advisor

The advisor should read, not write, from:
- `crop_plans`
- `crop_plan_deliveries`
- `farm_summaries`
- `grain_intelligence`
- `market_analysis`
- `x_market_signals`
- `grain_monitor_snapshots`
- `producer_car_allocations`
- `cftc_cot_positions`
- retrieved grain marketing knowledge in Supabase

The advisor should also use existing RPCs where helpful:
- `get_delivery_analytics()`
- `get_pipeline_velocity()`
- `get_logistics_snapshot()`
- `get_cot_positioning()`

## Data Model

### New table: `advisor_threads`

Purpose: One persistent thread container per farmer, with room for future multiple threads.

Columns:
- `id uuid primary key`
- `user_id uuid not null`
- `title text`
- `page_context text`
- `created_at timestamptz`
- `updated_at timestamptz`
- `archived_at timestamptz null`

RLS:
- user reads own rows only
- user inserts own rows only
- user updates own rows only

### New table: `advisor_messages`

Purpose: Stores the farmer's question, the assistant answer, citations, and model metadata.

Columns:
- `id uuid primary key`
- `thread_id uuid not null`
- `user_id uuid not null`
- `role text check ('user','assistant','system')`
- `content text not null`
- `page_context text`
- `route_path text`
- `citations jsonb default '[]'`
- `timing_labels jsonb default '[]'`
- `model_used text`
- `response_meta jsonb default '{}'`
- `created_at timestamptz`

RLS:
- user reads own rows only
- user inserts own rows only
- assistant writes happen through the server using the authenticated user context

### New table: `advisor_memory_items`

Purpose: Stores safe, approved, per-farmer memory facts.

Columns:
- `id uuid primary key`
- `user_id uuid not null`
- `memory_type text not null`
- `value text not null`
- `confidence numeric default 1.0`
- `source text not null`
- `status text check ('approved','inactive') default 'approved'`
- `last_confirmed_at timestamptz`
- `created_at timestamptz`

Allowed `memory_type` values in v1:
- `communication_style`
- `grain_focus`
- `operational_constraint`
- `sales_preference`
- `unit_preference`
- `planning_horizon`

RLS:
- user reads own rows only
- no direct client writes
- writes only through trusted server code

### New table: `advisor_feedback`

Purpose: Lets farmers rate whether an answer was helpful and where it missed.

Columns:
- `id uuid primary key`
- `message_id uuid not null`
- `user_id uuid not null`
- `helpful boolean`
- `feedback_note text`
- `created_at timestamptz`

RLS:
- user reads own rows only
- user inserts own rows only

## Memory Strategy

### v1 memory

Only store stable, low-risk facts:
- answer style preference
- preferred unit framing
- recurring logistics constraints
- focus grains
- planning horizon preference

### What should not be remembered

- market opinions that can go stale
- subjective labels about the farmer
- hidden traits or speculative judgments
- anything that can silently bias the core market call

### How memory gets written

v1 approach:
- explicit user settings
- trusted server-side extraction from app data
- optional admin-reviewed inserts

v1 does not include:
- automatic freeform memory extraction from every chat
- autonomous memory promotion by the model

## Advisor Prompting Strategy

The advisor should not answer from raw chat history alone.

Each request should build a structured context packet:
- current page context
- latest recommendation objects for relevant grains
- farmer position by grain
- recent deliveries
- peer context if privacy threshold is met
- timing labels for CGC, logistics, and COT
- approved memory items
- retrieved grain marketing knowledge chunks

The model response should be structured before display:
- `headline`
- `market_view`
- `farm_position`
- `recommendation`
- `evidence[]`
- `what_changes_the_call`
- `citations[]`

The UI can then render the answer consistently.

## Safety Boundaries

### Read-only production access

The advisor can read:
- user-scoped farm data
- public market and intelligence data
- approved memory rows for that user

The advisor cannot:
- edit crop plans
- create or modify deliveries
- change contracts
- update market intelligence tables
- trigger pipeline functions
- write to any table except advisor-specific chat and feedback tables

### Identity handling

- The server route must derive identity from the authenticated session.
- The client must never pass a trusted `user_id`.
- All DB policies must key off `auth.uid()`.

### Prompt boundary

- Do not expose secrets, raw SQL, or unrestricted tool access to the model.
- The model gets a curated context packet only.
- The model does not choose its own database queries.

### Cross-user isolation

- No shared chat history.
- No shared memory table reads.
- No "search previous conversations" feature across users.
- No global agent memory file outside the product DB.

### Memory boundary

- The advisor can reference approved memory.
- The advisor cannot silently create new approved memory items from a single message.
- Future candidate-memory workflows must be review-gated or threshold-gated.

## UI Components

New components:
- `components/advisor/advisor-dock.tsx`
- `components/advisor/advisor-launcher.tsx`
- `components/advisor/advisor-panel.tsx`
- `components/advisor/advisor-message-list.tsx`
- `components/advisor/advisor-composer.tsx`
- `components/advisor/advisor-answer-card.tsx`
- `components/advisor/advisor-context-chip.tsx`

Modified layout:
- `app/(dashboard)/layout.tsx` mounts the dock once for all dashboard pages.

## Agent Assignments

| Agent | Responsibility | Quality Gate |
|------|----------------|--------------|
| ultra-agent | Feature coordination, final review | signs off on rollout |
| ux-agent | launcher behavior, page-context UX, mobile/desktop hierarchy | verifies low visual footprint |
| ui-agent | floating launcher, sheet visuals, motion, states | verifies polish and accessibility |
| frontend-dev | Next.js route wiring, client components, layout integration | passes UI and route tests |
| db-architect | advisor tables, indexes, RLS, helper RPCs | schema and query review |
| auth-engineer | auth/session handling, read-only write boundaries | verifies no cross-user access |
| innovation-agent | Step 3.5 advisor prompt, knowledge retrieval, answer schema | response quality review |
| data-audit | timing labels, citations, source correctness | validates market context integrity |
| security-auditor | prompt-injection review, RLS review, boundary testing | signs off on safety controls |
| documentation-agent | plan updates, rollout notes, lessons learned | keeps docs current |

## Testing and Debugging Strategy

- Unit tests for context builders, answer parsing, and memory filtering.
- Integration tests for `/api/advisor/chat` auth, storage, and response shape.
- RLS verification for all advisor tables.
- UI tests for launcher visibility, desktop sheet, mobile sheet, and route persistence.
- Manual browser checks for overlap with existing page chrome.
- Structured logging for model errors, empty context packets, and citation gaps.

## Rollout Phases

### Phase 1

- Floating launcher
- one active thread per user
- Step 3.5 chat answers
- no autonomous memory writes
- feedback capture

### Phase 2

- richer knowledge retrieval
- explicit memory settings UI
- answer quality review workflow

### Phase 3

- disagreement escalation path to Grok
- candidate memory review flow
- proactive suggestion prompts

## Success Criteria

- Farmers can open the advisor from any dashboard page in one tap/click.
- Answers are clearly scoped to the current user and current page.
- No cross-user chat or memory leakage is possible through the product surface.
- The advisor gives actionable, evidence-backed grain marketing guidance instead of generic chat responses.
- The launcher remains visually light and does not crowd primary dashboards.
