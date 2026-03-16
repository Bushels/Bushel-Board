# Farmer Advisor Chat & Memory - Implementation Plan

**Goal:** Add a safe, per-farmer advisor chat that lives behind a floating dashboard launcher, uses Step 3.5 Flash for responses, reads only user-scoped farm and market data, and stores only narrow approved memory facts.

**Architecture:** A client-side `AdvisorDock` is mounted once in `app/(dashboard)/layout.tsx`. It calls a Next.js route handler that authenticates the user, assembles a read-only context packet, retrieves approved memory and knowledge chunks, calls Step 3.5 Flash, stores the message pair, and returns a structured answer with citations and timing labels.

**Tech Stack:** Next.js 16 App Router, Supabase Postgres + RLS, Supabase Auth, OpenRouter Step 3.5 Flash, TypeScript, Tailwind CSS, shadcn Sheet, Vitest, Playwright/manual browser verification

**Design Doc:** `docs/plans/2026-03-13-farmer-advisor-chat-design.md`

---

### Task 1: Create advisor tables and RLS policies

**Owner:** db-architect + auth-engineer

**Files:**
- Create: `supabase/migrations/20260313160000_create_advisor_chat_tables.sql`

**Deliverables:**
- `advisor_threads`
- `advisor_messages`
- `advisor_memory_items`
- `advisor_feedback`
- indexes for `user_id`, `thread_id`, and `updated_at`
- RLS that guarantees user-scoped reads and blocks writes outside advisor tables

**Verification:**
- `npx supabase db push`
- SQL checks:
  - user can only read own thread rows
  - user cannot read another user's rows
  - anon cannot read advisor tables

---

### Task 2: Add shared advisor types

**Owner:** frontend-dev

**Files:**
- Create: `lib/types/advisor.ts`

**Deliverables:**
- thread, message, memory, citation, and answer schema types
- structured answer interface for Step 3.5 responses
- allowed memory type union

**Verification:**
- `npx tsc --noEmit`

---

### Task 3: Build the advisor query layer

**Owner:** frontend-dev + db-architect

**Files:**
- Create: `lib/queries/advisor.ts`
- Create: `lib/utils/advisor-context.ts`

**Deliverables:**
- fetch active thread for current user
- fetch thread messages for current user
- fetch approved memory items for current user
- build a context packet from:
  - route context
  - crop plans
  - deliveries
  - farm summary
  - grain intelligence
  - market analysis
  - logistics snapshot
  - COT positioning
  - relevant knowledge chunks

**Verification:**
- unit tests for context assembly
- context packet contains timing labels and no caller-supplied user identity

---

### Task 4: Add a safe advisor chat route

**Owner:** frontend-dev + auth-engineer + innovation-agent

**Files:**
- Create: `app/api/advisor/chat/route.ts`

**Deliverables:**
- authenticated POST handler
- derives `user_id` from session
- stores user message
- builds advisor context packet
- calls Step 3.5 Flash through OpenRouter
- validates model output against structured answer schema
- stores assistant message with citations and response metadata
- returns structured answer JSON

**Guardrails:**
- no direct service-role access from the client
- no caller-supplied `user_id`
- no write path outside advisor tables

**Verification:**
- integration test for auth required
- integration test for own-thread access only
- mocked model-response test for schema validation

---

### Task 5: Add thread history and feedback routes

**Owner:** frontend-dev

**Files:**
- Create: `app/api/advisor/thread/route.ts`
- Create: `app/api/advisor/feedback/route.ts`

**Deliverables:**
- fetch current user's active thread and messages
- create/reset thread
- save helpful / not helpful feedback

**Verification:**
- user can only fetch own history
- feedback rows are user-scoped

---

### Task 6: Build the floating advisor UI shell

**Owner:** ui-agent + ux-agent + frontend-dev

**Files:**
- Create: `components/advisor/advisor-dock.tsx`
- Create: `components/advisor/advisor-launcher.tsx`
- Create: `components/advisor/advisor-panel.tsx`
- Create: `components/advisor/advisor-context-chip.tsx`
- Modify: `app/(dashboard)/layout.tsx`

**Deliverables:**
- compact floating launcher on all dashboard pages
- desktop right-side sheet
- mobile full-height sheet
- current page context chip
- visually light default state

**UX rules:**
- no overlap with nav or primary page CTAs
- launcher remains accessible on mobile
- no default open state

**Verification:**
- browser QA on Overview, My Farm, Grain Detail
- mobile responsive check

---

### Task 7: Build the chat conversation components

**Owner:** ui-agent + frontend-dev

**Files:**
- Create: `components/advisor/advisor-message-list.tsx`
- Create: `components/advisor/advisor-message.tsx`
- Create: `components/advisor/advisor-answer-card.tsx`
- Create: `components/advisor/advisor-composer.tsx`

**Deliverables:**
- user and assistant message rendering
- structured answer sections:
  - headline
  - recommendation
  - evidence
  - what changes the call
  - citations
- loading, error, empty, and retry states

**Verification:**
- component tests
- manual visual QA for long answers and narrow screens

---

### Task 8: Add memory MVP

**Owner:** auth-engineer + innovation-agent

**Files:**
- Create: `lib/advisor/memory.ts`
- Optionally create: `lib/queries/advisor-memory.ts`

**Deliverables:**
- read approved memory items for the current user
- support only safe v1 memory types
- seed memory from explicit settings and stable derived facts only
- no autonomous freeform memory extraction

**Verification:**
- unit tests for memory filtering
- memory types outside allowlist are ignored

---

### Task 9: Add prompt and retrieval guardrails

**Owner:** innovation-agent + security-auditor + data-audit

**Files:**
- Create: `lib/advisor/prompt.ts`
- Create: `lib/advisor/retrieval.ts`

**Deliverables:**
- advisor system prompt tuned for decision-support answers
- clear timing rules for CGC, logistics, and COT
- knowledge retrieval filtered to relevant chunks only
- citation mapping rules

**Verification:**
- prompt snapshot tests or fixture-based tests
- citation and timing labels present in sample answers
- no unrestricted tool or SQL access in prompt construction

---

### Task 10: Add automated tests and isolation checks

**Owner:** auth-engineer + security-auditor + frontend-dev + data-audit

**Files:**
- Create: `tests/lib/advisor-context.test.ts`
- Create: `tests/lib/advisor-memory.test.ts`
- Create: `tests/actions/advisor-chat.test.ts`
- Create: `tests/components/advisor-dock.test.tsx`

**Deliverables:**
- auth and user-isolation tests
- context builder tests
- schema validation tests
- UI rendering tests

**Verification:**
- `npm run test`
- targeted lint and type-check on touched files

---

### Task 11: Add browser QA and debugging workflow

**Owner:** frontend-dev + ui-agent + documentation-agent

**Files:**
- Optional: `docs/lessons-learned/advisor-chat.md`

**Deliverables:**
- manual QA checklist for launcher placement, route persistence, mobile behavior, and long-answer scroll behavior
- structured logging for:
  - model failures
  - empty context packets
  - missing citations
  - auth failures

**Verification:**
- visual browser pass on key dashboard routes
- documented reproduction steps for any overlap or focus-trap bugs

---

### Task 12: Update docs and status tracking

**Owner:** documentation-agent

**Files:**
- Modify: `docs/plans/STATUS.md`
- Modify: relevant architecture docs after rollout

**Deliverables:**
- new feature track added to status tracker
- rollout notes after each milestone
- lessons-learned entry for any isolation or UX issue found during implementation

---

## Suggested Agent Sequence

1. db-architect + auth-engineer
2. frontend-dev
3. innovation-agent
4. ui-agent + ux-agent
5. security-auditor + data-audit
6. documentation-agent
7. ultra-agent final review

## Definition of Done

- The advisor launcher is available on all authenticated dashboard pages.
- Chat answers are per-farmer, contextual, and read-only against production farm/market data.
- Memory is narrow, typed, and safe.
- No cross-user leakage is possible through UI, API, or database policy.
- Answers cite evidence and respect source timing.
- UI stays compact and does not steal primary dashboard space.
