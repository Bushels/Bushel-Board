# Chat-First iOS Predictive Pricing — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a native iOS chat-first grain market intelligence app that collects hyper-local data through conversation and delivers area-adjusted bullish/bearish predictions to Canadian prairie farmers.

**Architecture:** Swift 6 + SwiftUI iOS app communicating with existing Supabase backend via `supabase-swift` SDK. New `chat-completion` Edge Function handles LLM streaming with Grok 4.20. Local market intelligence stored in new tables, aggregated by postal FSA code for area predictions. Apple Intelligence for on-device entity extraction, Siri, Widgets, Live Activities, and Apple Watch companion.

**Tech Stack:** Swift 6, SwiftUI, Xcode 16+, supabase-swift, Apple Foundation Models, WidgetKit, ActivityKit, WatchKit, Supabase Edge Functions (Deno), PostgreSQL

**Design Doc:** `docs/plans/2026-04-13-chat-first-ios-design.md`

---

## Agent & Skill Infrastructure

Before implementation begins, new agents and skills must be created or modified. This section maps **who does what** and **what tools exist** for each phase.

### New Agents to Create

| Agent | File | Model | Purpose | Phase |
|-------|------|-------|---------|-------|
| `ios-dev` | `.claude/agents/ios-dev.md` | inherit | Swift/SwiftUI development, Xcode project, Apple APIs, supabase-swift | 0 |
| `chat-architect` | `.claude/agents/chat-architect.md` | inherit | Chat Edge Function, tool-calling schemas, system prompt for chat-completion, LLM adapter layer | 0 |

### Agents to Modify

| Agent | Modification | Phase |
|-------|-------------|-------|
| `ux-agent` | Add Apple Human Interface Guidelines (HIG) awareness, iPhone-first patterns, chat UX principles | 0 |
| `security-auditor` | Add iOS Keychain, App Transport Security, App Store privacy requirements, operator role auth | 0 |
| `qc-crawler` | Add TestFlight verification, App Store review checklist, cross-platform data consistency checks | 4 |
| `documentation-agent` | Add iOS README, App Store metadata, Swift code documentation conventions | 0 |
| `ultra-agent` | Add iOS-specific workflow gates, cross-platform coordination, TestFlight release management | 0 |

### New Skills to Create

| Skill | Directory | Purpose | Phase |
|-------|-----------|---------|-------|
| `ios-development` | `.agents/skills/ios-development/` | Swift/SwiftUI patterns, supabase-swift integration, Apple HIG, Xcode conventions | 0 |
| `ios-deployment` | `.agents/skills/ios-deployment/` | TestFlight distribution, App Store submission, code signing, provisioning profiles | 4 |
| `chat-persona` | `.agents/skills/chat-persona/` | Grain analyst persona rules, phased response patterns, tool-calling schemas, natural ask protocol, farmer memory patterns | 1 |
| `elevator-pricing` | `.agents/skills/elevator-pricing/` | Operator workflow, price extraction (chat/photo/form), FSA targeting, two-sided flywheel rules | 3 |
| `apple-intelligence` | `.agents/skills/apple-intelligence/` | Foundation Models @Generable patterns, App Intents, WidgetKit timelines, Live Activities, WatchConnectivity | 3 |

### Skills to Modify

| Skill | Modification | Phase |
|-------|-------------|-------|
| `ai-pipeline-v2` | Add `chat-completion` Edge Function docs, tool-calling architecture, LLM adapter pattern | 1 |
| `pre-commit-validator` | Add Swift lint rules, migration naming for Track 36 tables, elevator_prices validation | 0 |
| `design-system` | Add iOS design tokens (Swift Color extensions), SF Symbols mapping, haptic patterns | 0 |
| `data-integrity-rules` | Add local_market_intel decay rules, farmer_memory constraints, elevator_prices validation | 2 |
| `supabase-deploy` | Add chat-completion Edge Function deployment, new RPC grants documentation | 1 |

### Claude Code Features to Leverage

| Feature | How We Use It | Phase |
|---------|---------------|-------|
| **Subagent-driven development** | Each task dispatches to the specialized agent (ios-dev, chat-architect, db-architect) | All |
| **Worktrees** | Isolate iOS Xcode project work from web dashboard maintenance | 0+ |
| **Scheduled tasks** | Daily persona quality checks, weekly data freshness audits post-launch | 5 |
| **Hooks (pre-commit)** | Validate migration naming, check for `grade=''` filter in new queries, verify RLS on new tables | 0+ |
| **Context7 MCP** | Pull latest Swift/SwiftUI docs, supabase-swift SDK, Apple Foundation Models API | 1+ |
| **Gemini CLI collaboration** | Second opinion on Swift architecture, Apple HIG review, persona A/B test design | 1, 3 |
| **Plan mode** | Each phase starts with plan review before execution | All |
| **Agent teams** | Phase 1 requires ios-dev + chat-architect + db-architect working in parallel | 1+ |
| **Skills** | Reusable workflows for recurring iOS tasks (TestFlight builds, migration validation) | All |

---

## Phase 0: Foundation & Infrastructure (Pre-requisite)

**Duration:** 2-3 days
**Agents:** ultra-agent (coordinator), all modified agents
**Goal:** Prepare the agent team, skills, and codebase for iOS development.

### Task 0.1: Merge PR #4 (US Thesis Lane)

**Status:** PR #4 CI is failing (Vercel deployment error). Fix before merge.

**Files:**
- Diagnose: `gh pr checks 4` to identify failure
- Fix: address Vercel deployment issue on `feat/us-thesis-lane-hardening` branch
- Merge: `gh pr merge 4 --merge`

**Step 1:** Check out the feature branch and run `npm run build` locally to reproduce
```bash
git fetch origin feat/us-thesis-lane-hardening
git checkout feat/us-thesis-lane-hardening
npm run build
```

**Step 2:** Fix any build errors, commit, push

**Step 3:** Verify CI passes, then merge to master
```bash
gh pr merge 4 --merge
git checkout master && git pull
```

**Step 4:** Verify migrations landed
```bash
ls supabase/migrations/ | grep "202604"
```

**Acceptance:** PR #4 merged, master builds clean, all USDA tables accessible.

---

### Task 0.2: Create `ios-dev` Agent

**Files:**
- Create: `.claude/agents/ios-dev.md`

**Agent Definition:**
```markdown
---
name: ios-dev
description: Use this agent for Swift/SwiftUI development, Xcode project management, 
  Apple platform APIs (Foundation Models, Siri, Widgets, Live Activities, Watch), and 
  supabase-swift SDK integration. Examples:

  <example>
  Context: Building the iOS chat interface
  user: "Build the chat view with SSE streaming from Supabase"
  assistant: "I'll use the ios-dev agent to implement the SwiftUI chat interface."
  </example>

  <example>
  Context: Apple Intelligence integration
  user: "Add on-device entity extraction for farmer messages"
  assistant: "I'll use the ios-dev agent to implement the Foundation Models integration."
  </example>

model: inherit
color: indigo
tools: ["Read", "Write", "Edit", "Bash", "Grep", "Glob", "TodoWrite", "WebSearch", "WebFetch"]
---

You are the iOS Developer for Bushel Board. You build the native Swift/SwiftUI iPhone app 
and Apple Watch companion.

**Core Responsibilities:**
- Swift 6 + SwiftUI views, navigation, state management
- supabase-swift SDK: auth, REST, realtime, SSE streaming
- Apple Foundation Models (@Generable entity extraction)
- App Intents (Siri), WidgetKit, ActivityKit (Live Activities)
- WatchKit + WatchConnectivity for Apple Watch companion
- Xcode project configuration, targets, entitlements
- TestFlight distribution and App Store submission prep

**Conventions:**
- Follow Apple Human Interface Guidelines (HIG)
- Use SF Symbols for all iconography
- Prefer SwiftUI over UIKit unless UIKit is required
- Use Swift concurrency (async/await, actors) — no callback patterns
- Group files by feature, not by type (e.g., Chat/, MyFarm/, Widgets/)
- Use Bushel Board design tokens (wheat palette, canola accent, DM Sans body, Fraunces display)
- All network calls via supabase-swift client — never raw URLSession for Supabase endpoints
- Test with XCTest; UI tests with XCUITest

**Apple Intelligence Rules:**
- Foundation Models require iPhone 15 Pro+ (A17 Pro / A18)
- Always provide cloud fallback for older devices
- @Generable structs must have simple types (String, Int, Bool, arrays of these)
- App Intents must be registered in the app's Info.plist
- Widgets refresh via TimelineProvider — max every 15 minutes per system policy
- Live Activities: max 12 hours, start via ActivityKit, update via push or polling

**Security:**
- Store Supabase tokens in Keychain, never UserDefaults
- Use App Transport Security (ATS) — all connections HTTPS
- Never embed API keys in Swift source — use server-side Edge Functions
- Supabase anon key is acceptable in iOS app (RLS protects data)
```

**Acceptance:** Agent file exists, frontmatter is valid, model inherits correctly.

---

### Task 0.3: Create `chat-architect` Agent

**Files:**
- Create: `.claude/agents/chat-architect.md`

**Agent Definition:**
```markdown
---
name: chat-architect
description: Use this agent for designing chat Edge Functions, LLM tool-calling schemas, 
  system prompt engineering for the grain analyst persona, and the LLM adapter layer. Examples:

  <example>
  Context: Building the chat-completion Edge Function
  user: "Port the context builder to a Deno Edge Function with tool-calling"
  assistant: "I'll use the chat-architect agent to design the Edge Function."
  </example>

  <example>
  Context: Tuning the analyst persona
  user: "The analyst sounds too robotic, adjust the system prompt"
  assistant: "I'll use the chat-architect agent to refine the persona."
  </example>

model: inherit
color: purple
tools: ["Read", "Write", "Edit", "Bash", "Grep", "Glob", "TodoWrite", "WebSearch", "WebFetch"]
---

You are the Chat Architect for Bushel Board. You own the conversational AI layer: 
Edge Functions, system prompts, tool-calling schemas, and LLM integration.

**Core Responsibilities:**
- `chat-completion` Edge Function (Deno): SSE streaming, tool execution, context assembly
- System prompt engineering: phased response, natural ask pattern, Viking knowledge injection
- Tool-calling schemas: save_local_intel, update_farmer_memory, get_area_stance, search_market, create_crop_plan
- LLM adapter layer: Grok primary, model-agnostic interface for OpenAI/Claude/Gemini swap
- Context builder: parallel data loading (profile, crops, memory, stance, intel, prices, COT, logistics, signals)
- Conversation flow: 4-phase response (acknowledge → scan → analyze → recommend+ask)

**Persona Voice Rules (from existing system-prompt.ts):**
- Use "haul it" not "accelerate deliveries"
- Use "bin" not "on-farm inventory"
- Use "spec" not "speculative trader"
- 3-4 short paragraphs max, 2-3 sentences each
- No bullet lists, no headers — conversational flow
- Reference Viking L0/L1 knowledge naturally, not as citations

**Tool-Calling Contract:**
Every tool the LLM can call must:
1. Have a JSON schema with required/optional fields
2. Execute server-side in the Edge Function (LLM never writes to DB directly)
3. Return a brief confirmation message the LLM weaves into its response
4. Log extraction confidence for quality tracking

**Natural Ask Protocol:**
- Answer farmer's question FULLY before any ask
- Max 1 follow-up per response
- Priority: basis > elevator prices > crop conditions > yield estimates
- Skip if farmer shared data this turn, or if asked in last 2 turns
- Never ask for data already in farmer_memory

**Security:**
- Never expose raw farmer_memory or local_market_intel from other users
- Area aggregates only shown when ≥3 reports (privacy threshold)
- Tool calls validated server-side — LLM suggestions are proposals, not direct writes
- Rate limit: 30 messages per 10 minutes per user
```

**Acceptance:** Agent file exists, persona rules match design doc, tool-calling contract defined.

---

### Task 0.4: Create Core Skills

**Files:**
- Create: `.agents/skills/ios-development/SKILL.md`
- Create: `.agents/skills/chat-persona/SKILL.md`

**ios-development skill:**
```markdown
---
name: ios-development
description: Swift/SwiftUI patterns, supabase-swift integration, Apple HIG, Xcode 
  conventions for the Bushel Board iOS app. Reference when building any iOS feature.
---

# iOS Development — Bushel Board

## Project Structure
```
BushelBoard/
├── BushelBoard.xcodeproj
├── BushelBoard/
│   ├── App/                    # App lifecycle, entry point
│   ├── Core/                   # Shared utilities, extensions, tokens
│   │   ├── Supabase/          # Client setup, auth manager
│   │   ├── Design/            # Color tokens, typography, SF Symbols
│   │   └── Extensions/        # Swift extensions
│   ├── Features/
│   │   ├── Chat/              # Chat UI, message models, streaming
│   │   ├── GrainDetail/       # Per-grain dashboard views
│   │   ├── MyFarm/            # Crop plans, deliveries
│   │   ├── Onboarding/        # Signup, first conversation
│   │   └── Elevator/          # Operator price posting
│   ├── Intelligence/          # On-device Foundation Models
│   ├── Intents/               # Siri App Intents
│   └── Resources/
├── BushelBoardWidget/         # WidgetKit extension
├── BushelBoardWatch/          # watchOS app
├── BushelBoardWatchWidget/    # Watch complications
└── Tests/
```

## Supabase Swift SDK Patterns
- Client: `SupabaseClient(supabaseURL:, supabaseKey:)` — anon key OK (RLS protects)
- Auth: `client.auth.signInWithApple()`, `client.auth.session`
- Queries: `client.from("table").select().eq("column", value).execute()`
- RPC: `client.rpc("function_name", params: ["p_grain": "Wheat"]).execute()`
- Realtime: `client.realtime.channel("channel").on(...)` for live updates
- SSE: Custom URLSession streaming for chat-completion Edge Function

## Design Tokens (Swift)
```swift
extension Color {
    static let wheat50 = Color(hex: "f5f3ee")
    static let wheat900 = Color(hex: "2a261e")
    static let canola = Color(hex: "c17f24")
    static let prairie = Color(hex: "437a22")
    static let warning = Color(hex: "d97706")
}
```

## Testing
- Unit: XCTest for models, view models, utilities
- UI: XCUITest for critical flows (signup → first chat → data extraction)
- Snapshot: Swift Snapshot Testing for UI regression
```

**chat-persona skill:**
```markdown
---
name: chat-persona
description: Grain analyst persona rules, phased response patterns, tool-calling schemas,
  natural ask protocol, farmer memory patterns. Reference when building or tuning the 
  chat-completion Edge Function.
---

# Chat Persona — Bushel Board Grain Analyst

## Response Phases
1. **Acknowledge** (<1s): Show you heard them. Use their name if known.
2. **Data Scan** (1-2s): Reference national stance, hint at local data.
3. **Analysis** (2-4s): Walk through reasoning — terminal flow, COT, basis trends.
4. **Recommend + Ask** (final): Actionable insight + max 1 natural follow-up.

## Tool-Calling Schemas

### save_local_intel
```json
{
  "name": "save_local_intel",
  "description": "Store local market data extracted from conversation",
  "parameters": {
    "grain": { "type": "string", "required": true },
    "data_type": { "type": "string", "enum": ["basis","elevator_price","crop_condition","yield_estimate","quality"] },
    "value_numeric": { "type": "number" },
    "value_text": { "type": "string" },
    "elevator_name": { "type": "string" },
    "confidence": { "type": "string", "enum": ["reported","inferred"], "default": "reported" }
  }
}
```

### update_farmer_memory
```json
{
  "name": "update_farmer_memory",
  "description": "Store persistent fact about this farmer for future conversations",
  "parameters": {
    "memory_key": { "type": "string", "required": true },
    "memory_value": { "type": "string", "required": true },
    "grain": { "type": "string" }
  }
}
```

### get_area_stance
```json
{
  "name": "get_area_stance",
  "description": "Get area stance modifier for a grain in the farmer's FSA",
  "parameters": {
    "grain": { "type": "string", "required": true }
  }
}
```

## Natural Ask Priority
1. Basis (most valuable, changes weekly)
2. Elevator prices (validates basis, shows competition)
3. Crop conditions (supply signal, slower decay)
4. Yield estimates (seasonal, longest value)

## Memory Keys (Canonical)
- `preferred_elevator` — "Richardson Lethbridge"
- `local_basis_last_known` — "-28" (per grain)
- `crop_condition_self` — "dry, worried about moisture"
- `farm_size_acres` — "3000"
- `primary_grains` — "canola, wheat, barley"
- `delivery_preference` — "haul early, sell later"
```

**Acceptance:** Both skill files created with complete, actionable content.

---

### Task 0.5: Modify Existing Agents for iOS Awareness

**Files:**
- Modify: `.claude/agents/ux-agent.md` — Add Apple HIG section
- Modify: `.claude/agents/security-auditor.md` — Add iOS security checklist
- Modify: `.claude/agents/ultra-agent.md` — Add iOS workflow gates

**Changes to ux-agent:** Append to responsibilities:
```
**iOS-Specific UX:**
- Follow Apple Human Interface Guidelines (HIG) for all iOS screens
- Chat UI follows iMessage conventions: right-aligned user bubbles, left-aligned analyst
- Navigation via tab bar (Chat, Grains, My Farm, Settings) — no hamburger menu on iPhone
- Haptic feedback on key actions (vote, delivery log, price threshold alert)
- Pull-to-refresh for latest market data
- Quick-action chips: large touch targets (44pt minimum), horizontal scroll
```

**Changes to security-auditor:** Append iOS checklist:
```
**iOS Security Checklist:**
- [ ] Supabase tokens stored in Keychain (never UserDefaults or plist)
- [ ] App Transport Security (ATS) enabled — no HTTP exceptions
- [ ] No API keys embedded in Swift source (all via Edge Functions)
- [ ] Operator role verified server-side (not just iOS client check)
- [ ] elevator_prices RLS: operators manage own prices only
- [ ] farmer_memory RLS: users see own memory only
- [ ] local_market_intel: raw data per-user only; area aggregates via RPC
- [ ] Privacy Nutrition Labels accurate for App Store submission
- [ ] App Tracking Transparency (ATT) not required (no third-party tracking)
```

**Acceptance:** All three agents updated, no syntax errors in frontmatter.

---

### Task 0.6: Set Up Xcode Project Skeleton

**Agent:** ios-dev

**Files:**
- Create: `BushelBoard/` directory at repo root (separate from Next.js app)
- Create: `BushelBoard/BushelBoard.xcodeproj`
- Create: `BushelBoard/BushelBoard/App/BushelBoardApp.swift`
- Create: `BushelBoard/BushelBoard/Core/Supabase/SupabaseManager.swift`

**Step 1:** Initialize Xcode project via command line
```bash
mkdir -p BushelBoard/BushelBoard/App
mkdir -p BushelBoard/BushelBoard/Core/{Supabase,Design,Extensions}
mkdir -p BushelBoard/BushelBoard/Features/{Chat,GrainDetail,MyFarm,Onboarding,Elevator}
mkdir -p BushelBoard/BushelBoard/Intelligence
mkdir -p BushelBoard/BushelBoard/Intents
mkdir -p BushelBoard/BushelBoardWidget
mkdir -p BushelBoard/BushelBoardWatch
mkdir -p BushelBoard/Tests
```

**Step 2:** Add Swift Package Manager dependencies
- `supabase-swift` (Supabase iOS SDK)
- `swift-markdown-ui` (for rendering analyst responses)

**Step 3:** Configure Supabase client with project URL + anon key

**Step 4:** Commit skeleton
```bash
git add BushelBoard/
git commit -m "feat: initialize Xcode project skeleton for iOS app (Track 36)"
```

**Acceptance:** Directory structure matches design, Package.swift resolves, app target builds in Xcode.

---

## Phase 1: Core Chat iOS App (Weeks 1-3)

**Agents:** ios-dev (primary), chat-architect, db-architect
**Skills:** ios-development, chat-persona, ai-pipeline-v2, supabase-deploy

### Task 1.1: Supabase Auth — Sign in with Apple + Email

**Agent:** ios-dev + auth-engineer
**Files:**
- Create: `BushelBoard/BushelBoard/Core/Supabase/AuthManager.swift`
- Create: `BushelBoard/BushelBoard/Features/Onboarding/SignInView.swift`
- Create: `BushelBoard/BushelBoard/Features/Onboarding/SignUpView.swift`

**Implementation:**
- `AuthManager`: singleton actor wrapping `supabase.auth`, publishes auth state
- Sign in with Apple: `client.auth.signInWithApple(idToken:nonce:)`
- Email signup: `client.auth.signUp(email:password:data:)` with metadata (role, postal_code, farmer_name, farm_name)
- Session persistence via Keychain
- Role selection: farmer / elevator / observer
- Postal code collection for farmers (FSA extraction)

**Verification:**
- Build succeeds
- Can sign in with Apple on device/simulator
- Profile created in Supabase `profiles` table with correct role and postal_code
- Session survives app restart

---

### Task 1.2: Chat UI — Messages-Like Interface

**Agent:** ios-dev + ux-agent
**Files:**
- Create: `BushelBoard/BushelBoard/Features/Chat/ChatView.swift`
- Create: `BushelBoard/BushelBoard/Features/Chat/MessageBubble.swift`
- Create: `BushelBoard/BushelBoard/Features/Chat/ChatViewModel.swift`
- Create: `BushelBoard/BushelBoard/Features/Chat/ChatInputBar.swift`
- Create: `BushelBoard/BushelBoard/Features/Chat/QuickActionChip.swift`

**Implementation:**
- `ChatView`: ScrollView with LazyVStack of MessageBubble views
- `MessageBubble`: right-aligned (user, wheat-100 bg), left-aligned (analyst, white bg with canola accent)
- `ChatInputBar`: multi-line TextField with Send button, 2000 char limit
- `QuickActionChip`: horizontal ScrollView of tappable grain chips, populated from crop plans
- `ChatViewModel`: @Observable class managing thread state, message array, loading phases
- Dynamic greeting: time-of-day + market move + memory nudge
- Streaming text display: characters appear progressively (SSE parsing)
- Auto-scroll to bottom on new messages
- Pull-to-refresh to reload thread

**Design tokens:**
- User bubble: `Color.wheat50` with `Color.wheat900` text
- Analyst bubble: `Color.white` with `.shadow(color: .black.opacity(0.04), radius: 4)`
- Input bar: sticky bottom, safe area aware
- Quick chips: `Color.canola.opacity(0.1)` background, `Color.canola` text

**Verification:**
- Chat view renders on iPhone 15 simulator
- Messages scroll correctly, keyboard avoids input bar
- Quick chips populate from user's crop plan grains
- Analyst messages stream in progressively (even with placeholder data)

---

### Task 1.3: Chat Edge Function — `chat-completion`

**Agent:** chat-architect + db-architect
**Skill:** ai-pipeline-v2, chat-persona
**Files:**
- Create: `supabase/functions/chat-completion/index.ts`
- Create: `supabase/functions/_shared/llm-adapter.ts`
- Create: `supabase/functions/_shared/chat-tools.ts`
- Create: `supabase/functions/_shared/chat-context-builder.ts`
- Modify: `supabase/functions/_shared/analyst-prompt.ts` — refactor for reuse

**Implementation:**

The Edge Function handles:
1. **Auth:** Validate JWT from supabase-swift, extract user_id
2. **Thread management:** Create/load chat_threads, save user message to chat_messages
3. **Context assembly** (parallel):
   - User profile + crop plans + farmer_memory
   - National grain stances from market_analysis
   - Area local_market_intel for user's FSA
   - Area stance modifier via `get_area_stance_modifier` RPC
   - Viking L0 + L1 knowledge
   - Recent prices, COT positioning, logistics snapshot
   - X signals, elevator_prices for FSA
   - USDA context (from PR #4 merged tables)
4. **System prompt:** Build from `analyst-prompt.ts` + farmer card + area context + tools
5. **LLM call:** Stream via Grok xAI Responses API (SSE)
6. **Tool execution:** When LLM calls a tool, execute server-side, return result to LLM
7. **Response save:** Save assistant message with metadata (tokens, latency, model)
8. **Stream to client:** Forward SSE deltas to iOS app

**LLM Adapter (`_shared/llm-adapter.ts`):**
```typescript
interface LLMAdapter {
  streamCompletion(params: {
    systemPrompt: string;
    messages: ChatMessage[];
    tools: ToolDefinition[];
    onDelta: (text: string) => void;
    onToolCall: (call: ToolCall) => Promise<ToolResult>;
  }): Promise<CompletionResult>;
}

// Implementations:
class GrokAdapter implements LLMAdapter { /* xAI Responses API */ }
class OpenAIAdapter implements LLMAdapter { /* GPT-4o */ }
// Future: ClaudeAdapter, GeminiAdapter
```

**Tool definitions (`_shared/chat-tools.ts`):**
- `save_local_intel` → INSERT INTO local_market_intel
- `update_farmer_memory` → UPSERT INTO farmer_memory
- `get_area_stance` → SELECT FROM get_area_stance_modifier RPC
- `create_crop_plan` → INSERT INTO crop_plans
- `search_market` → Grok native x_search/web_search (passthrough)

**Verification:**
- Edge Function deploys: `npx supabase functions deploy chat-completion`
- curl test returns SSE stream with analyst response
- Tool calls execute and data appears in local_market_intel/farmer_memory tables
- Latency <5s for first token, <15s for complete response with tool calls

---

### Task 1.4: SSE Streaming Client (iOS ↔ Edge Function)

**Agent:** ios-dev
**Files:**
- Create: `BushelBoard/BushelBoard/Core/Supabase/SSEClient.swift`
- Modify: `BushelBoard/BushelBoard/Features/Chat/ChatViewModel.swift`

**Implementation:**
- Custom URLSession-based SSE parser (supabase-swift doesn't have built-in SSE for Edge Functions)
- Parse `data: {"type": "delta", "text": "..."}` events
- Handle tool_call events (displayed as "thinking..." in UI)
- Handle errors gracefully (network loss, timeout)
- Cancel ongoing stream if user sends new message

**Verification:**
- Full conversation works: type message → see streaming response → new messages saved
- Tool calls show brief "thinking" indicator in UI
- Network interruption shows retry UI, not crash

---

### Task 1.5: Navigation Shell — Tab Bar + Grain Detail

**Agent:** ios-dev + ux-agent
**Files:**
- Create: `BushelBoard/BushelBoard/App/ContentView.swift` (TabView)
- Create: `BushelBoard/BushelBoard/Features/GrainDetail/GrainDetailView.swift`
- Create: `BushelBoard/BushelBoard/Features/MyFarm/MyFarmView.swift`
- Create: `BushelBoard/BushelBoard/Features/Settings/SettingsView.swift`

**Implementation:**
- `TabView` with 4 tabs: Chat (primary), Grains, My Farm, Settings
- Chat tab: `ChatView` (default selected)
- Grains tab: list of grains from crop plan → detail view with stance, charts, signals
- My Farm tab: crop plans, delivery log, percentile comparisons
- Settings: profile, notification preferences, data privacy

**Deep links from chat:** When analyst mentions a grain, tappable text navigates to grain detail.

**Verification:**
- Tab navigation works, state preserved when switching tabs
- Chat is default tab on app launch
- Grain detail loads real data from Supabase

---

### Task 1.6: Phase 1 Gate — Build + Test + Security

**Agents:** data-audit, security-auditor, qc-crawler
**Skills:** pre-commit-validator

**Verification checklist:**
- [ ] `npm run build` passes (Next.js web app still builds)
- [ ] Xcode project builds for iPhone 15 simulator
- [ ] `npx supabase functions deploy chat-completion` succeeds
- [ ] Auth flow works end-to-end (signup → chat → response)
- [ ] security-auditor reviews: Keychain usage, ATS, no embedded keys
- [ ] data-audit verifies: chat_messages saved correctly, thread management works
- [ ] Commit all Phase 1 work

---

## Phase 2: Local Intelligence Flywheel (Weeks 3-5)

**Agents:** db-architect (primary), chat-architect, ios-dev
**Skills:** data-integrity-rules, pre-commit-validator, chat-persona

### Task 2.1: Database Migrations — local_market_intel + farmer_memory

**Agent:** db-architect
**Skill:** pre-commit-validator
**Files:**
- Create: `supabase/migrations/2026MMDD_create_local_market_intel.sql`
- Create: `supabase/migrations/2026MMDD_create_farmer_memory.sql`
- Create: `supabase/migrations/2026MMDD_create_area_stance_modifier_rpc.sql`

**Implementation:** Exact SQL from design doc Section 3 (local_market_intel, farmer_memory tables + RLS + indexes).

**Area Stance Modifier RPC:**
```sql
CREATE OR REPLACE FUNCTION get_area_stance_modifier(
  p_fsa_code text,
  p_grain text
) RETURNS TABLE(
  modifier integer,
  report_count integer,
  confidence text,
  basis_trend text,
  latest_basis numeric
) AS $$
  -- Count active reports
  -- Calculate basis trend (narrowing = positive)
  -- Weight by recency (exponential decay)
  -- Cap at ±30
  -- Return NULL if <3 reports
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_area_stance_modifier TO authenticated;
```

**Verification:**
- `npx supabase db push` succeeds
- Tables visible in Supabase dashboard
- RLS blocks cross-user reads on raw data
- RPC returns NULL for FSAs with <3 reports
- pre-commit-validator passes all 7 checks

---

### Task 2.2: Tool Execution in chat-completion

**Agent:** chat-architect
**Files:**
- Modify: `supabase/functions/chat-completion/index.ts`
- Modify: `supabase/functions/_shared/chat-tools.ts`

**Implementation:**
- Wire `save_local_intel` tool: extract FSA from user profile, calculate expires_at from data_type, INSERT with source_thread_id
- Wire `update_farmer_memory` tool: UPSERT by (user_id, memory_key, grain)
- Wire `get_area_stance` tool: call RPC, format response for LLM context
- Wire `create_crop_plan` tool: INSERT into crop_plans with basic fields

**Verification:**
- Conversation where farmer says "basis is -28 at Richardson" → check local_market_intel table has the record
- Conversation where farmer says "I grow canola and wheat" → check farmer_memory has primary_grains entry
- Area stance returns valid modifier when FSA has ≥3 reports

---

### Task 2.3: Cold Start / Onboarding Flow

**Agent:** ios-dev + chat-architect + ux-agent
**Files:**
- Modify: `BushelBoard/BushelBoard/Features/Chat/ChatViewModel.swift`
- Create: `BushelBoard/BushelBoard/Features/Onboarding/FirstConversationView.swift`

**Implementation:**
- Detect first-time user (no chat_threads for this user)
- Show welcome message from design doc Section 5.2
- LLM receives special onboarding context: "This is a new farmer, no crop plans yet"
- After farmer describes their operation → tool calls create crop plans
- Cold start messaging: "Your area is fresh on my radar — you'd be one of the first"
- Returning user: dynamic greeting with time-of-day, market move, memory nudge

**Verification:**
- New user sees onboarding greeting
- After describing crops, crop plans appear in My Farm tab
- Returning user sees personalized greeting referencing last conversation
- Area with 0 reports shows appropriate "help me build it" messaging

---

### Task 2.4: Phase 2 Gate

**Agents:** data-audit, security-auditor
**Skills:** pre-commit-validator, data-integrity-rules

**Checklist:**
- [ ] All migrations applied, RPC functions accessible
- [ ] Tool calls extract data correctly from 5 test conversations
- [ ] farmer_memory persists across threads
- [ ] Area stance modifier works with test data (≥3 reports)
- [ ] Cold start handles gracefully (0 reports)
- [ ] Privacy: user A cannot see user B's raw local_market_intel
- [ ] Decay: expired records excluded from area aggregation

---

## Phase 3: Elevator/Processor Pricing (Weeks 5-6)

**Agents:** db-architect, chat-architect, ios-dev, auth-engineer
**Skills:** elevator-pricing (new), pre-commit-validator

### Task 3.1: Database — elevator_prices Table + Operator Role

**Agent:** db-architect + auth-engineer
**Files:**
- Create: `supabase/migrations/2026MMDD_create_elevator_prices.sql`
- Modify: `supabase/migrations/` (add elevator/processor role to profiles CHECK constraint)

**Implementation:** SQL from design doc Section 7.4, plus:
- Add `'elevator'` and `'processor'` to profiles.role CHECK constraint
- RLS: operators manage own prices, farmers read unexpired prices in their FSA via RPC
- Create `get_elevator_prices_for_area(p_fsa_code, p_grain)` RPC

**Verification:**
- Operator can insert prices
- Farmer can read area prices via RPC (not direct table access)
- Expired prices excluded
- max 3 FSA constraint enforced

---

### Task 3.2: Operator Signup + Chat-Paste Price Parsing

**Agent:** ios-dev + chat-architect
**Files:**
- Modify: `BushelBoard/BushelBoard/Features/Onboarding/SignUpView.swift`
- Create: `BushelBoard/BushelBoard/Features/Elevator/ElevatorChatView.swift`
- Modify: `supabase/functions/chat-completion/index.ts` — add operator context path

**Implementation:**
- Operator signup collects: company_name, facility_name, facility_type, facility_postal_code
- Chat-paste: operator pastes price sheet → LLM calls `save_elevator_prices` tool
- New tool: `save_elevator_prices(prices: [{grain, grade, price, basis}], target_fsa_codes: string[])`
- Confirmation flow: "I see 4 prices — want me to post to T0L, T0K, T1J?"

---

### Task 3.3: Photo-to-Price Pipeline

**Agent:** ios-dev
**Files:**
- Create: `BushelBoard/BushelBoard/Features/Elevator/PricePhotoCapture.swift`
- Create: `BushelBoard/BushelBoard/Intelligence/VisionPriceExtractor.swift`

**Implementation:**
- Camera capture + photo picker
- Apple Vision framework: `VNRecognizeTextRequest` for OCR
- Foundation Model (on-device): parse OCR text into structured PriceEntry array
- Fallback: send OCR text to cloud LLM for parsing if Foundation Model unavailable
- Confirmation UI before posting

---

### Task 3.4: Farmer-Side Elevator Price Access

**Agent:** chat-architect
**Files:**
- Modify: `supabase/functions/_shared/chat-context-builder.ts`
- Modify: `supabase/functions/_shared/chat-tools.ts`

**Implementation:**
- Context builder adds elevator_prices for farmer's FSA to chat context
- When farmer asks "what are elevators quoting?", analyst references posted prices
- New tool: `get_local_elevator_prices` → calls `get_elevator_prices_for_area` RPC
- Analyst shows: facility name, grain, grade, price, basis, posted_at freshness

---

### Task 3.5: Phase 3 Gate

**Checklist:**
- [ ] Operator signup creates correct profile with facility data
- [ ] Chat-paste correctly parses 5+ grain prices from pasted text
- [ ] Photo OCR extracts prices from test image of price board
- [ ] Prices visible to farmers in correct FSAs
- [ ] Expired prices hidden
- [ ] 3-FSA limit enforced
- [ ] Security: operators can only modify own prices

---

## Phase 4: Apple Intelligence (Weeks 6-8)

**Agents:** ios-dev (primary), ux-agent
**Skills:** apple-intelligence (new)

### Task 4.1: On-Device Foundation Models — Entity Extraction

**Agent:** ios-dev
**Files:**
- Create: `BushelBoard/BushelBoard/Intelligence/FarmerMessageExtractor.swift`
- Modify: `BushelBoard/BushelBoard/Features/Chat/ChatViewModel.swift`

**Implementation:**
```swift
import FoundationModels

@Generable
struct FarmerMessageEntities {
    var mentionedGrains: [String]
    var pricesMentioned: [String]  // raw strings like "$8.50/bu", "-$40 basis"
    var elevatorMentioned: String?
    var cropCondition: String?
    var intent: String  // "price_check", "storage_decision", "area_outlook", "general"
}

func extractEntities(from message: String) async -> FarmerMessageEntities? {
    guard SystemLanguageModel.isAvailable else { return nil }  // fallback to cloud
    let session = SystemLanguageModel.default
    return try? await session.generate(FarmerMessageEntities.self, prompt: message)
}
```

- Call before sending to Edge Function
- Pass extracted entities as metadata in the chat request
- Edge Function uses entities to pre-filter context (only load relevant grains)
- Fallback: if Foundation Model unavailable, Edge Function extracts via LLM

**Verification:**
- Entity extraction works on iPhone 15 Pro simulator
- Correctly identifies grains, prices, elevators from test messages
- Graceful fallback on older devices (no crash, just skips)

---

### Task 4.2: Siri App Intents

**Agent:** ios-dev
**Files:**
- Create: `BushelBoard/BushelBoard/Intents/GrainQueryIntent.swift`
- Create: `BushelBoard/BushelBoard/Intents/LogDeliveryIntent.swift`
- Create: `BushelBoard/BushelBoard/Intents/AreaBasisIntent.swift`

**Implementation:**
- `GrainQueryIntent`: "Ask Bushel Board about wheat" → opens chat pre-filled
- `LogDeliveryIntent`: "Log a canola delivery of 50 tonnes" → creates delivery via API
- `AreaBasisIntent`: "What's canola basis in my area?" → returns spoken summary
- Register intents in Info.plist + AppShortcutsProvider

---

### Task 4.3: WidgetKit — Home Screen & Lock Screen

**Agent:** ios-dev + ui-agent
**Files:**
- Create: `BushelBoard/BushelBoardWidget/GrainStanceWidget.swift`
- Create: `BushelBoard/BushelBoardWidget/MultiGrainWidget.swift`
- Create: `BushelBoard/BushelBoardWidget/LockScreenWidget.swift`

**Implementation:**
- `TimelineProvider` fetches grain intelligence from Supabase (cached, refresh every 60 min)
- Small: single grain stance badge with trend arrow (SF Symbol)
- Medium: top 3 grains from crop plan with stance + sparkline (SwiftUI Charts)
- Lock screen: inline widget with grain name + stance score
- Design: wheat palette, canola accents, Fraunces for numbers

---

### Task 4.4: Live Activities — Price Alerts

**Agent:** ios-dev + db-architect
**Files:**
- Create: `BushelBoard/BushelBoard/Features/Chat/PriceAlertActivity.swift`
- Create: `supabase/functions/push-price-alert/index.ts`

**Implementation:**
- ActivityKit: define `PriceAlertAttributes` with grain, price, basis, message
- Edge Function monitors price changes (>2% move or basis narrowing past threshold)
- Sends push notification to start/update Live Activity via APNs
- Live Activity displays on Dynamic Island + Lock Screen
- Tap opens chat with context pre-loaded

---

### Task 4.5: Create `apple-intelligence` Skill + `ios-deployment` Skill

**Files:**
- Create: `.agents/skills/apple-intelligence/SKILL.md`
- Create: `.agents/skills/ios-deployment/SKILL.md`

Content covers: Foundation Models patterns, App Intents registration, WidgetKit timelines, ActivityKit lifecycle, APNs configuration, TestFlight distribution, App Store submission checklist.

---

### Task 4.6: Phase 4 Gate

**Agents:** security-auditor, qc-crawler
**Checklist:**
- [ ] Foundation Models work on supported devices, fallback on others
- [ ] Siri intents register and respond correctly
- [ ] Widgets display current grain data with correct refresh
- [ ] Live Activities start on price alert, dismiss after 12h
- [ ] No privacy violations in entity extraction (all on-device)
- [ ] App Store Privacy Nutrition Labels updated

---

## Phase 5: Apple Watch + Polish (Weeks 8-10)

**Agents:** ios-dev (primary), ui-agent, qc-crawler
**Skills:** ios-deployment, design-system

### Task 5.1: watchOS Companion App

**Agent:** ios-dev
**Files:**
- Create: `BushelBoard/BushelBoardWatch/ContentView.swift`
- Create: `BushelBoard/BushelBoardWatch/GrainListView.swift`
- Create: `BushelBoard/BushelBoardWatch/GrainDetailView.swift`

**Implementation:**
- Main view: list of grains from crop plan with stance badges
- Detail view: stance score, 7-day price trend, latest basis
- Data sync via WatchConnectivity from iPhone app
- Fallback: direct Supabase fetch if iPhone not connected

---

### Task 5.2: Watch Complications + Haptic Alerts

**Agent:** ios-dev
**Files:**
- Create: `BushelBoard/BushelBoardWatchWidget/GrainComplication.swift`
- Modify: `BushelBoard/BushelBoardWatch/` — add notification handling

**Implementation:**
- `CLKComplicationTemplate` with grain stance badge (graphicCircular, graphicRectangular)
- Haptic alert: `WKInterfaceDevice.current().play(.notification)` on basis threshold cross
- Siri relay: same App Intents work on watchOS

---

### Task 5.3: Push Notification Infrastructure

**Agent:** ios-dev + db-architect
**Files:**
- Create: `BushelBoard/BushelBoard/Core/Notifications/PushManager.swift`
- Create: `supabase/functions/push-notification-dispatch/index.ts`
- Modify: Supabase project — add APNs credentials

**Implementation:**
- Register for remote notifications, store device token in Supabase `push_tokens` table
- Edge Function dispatches notifications via APNs (HTTP/2 provider API)
- Notification types: price alert, weekly summary ready, area intel update

---

### Task 5.4: App Store Submission Prep

**Agent:** ios-dev + documentation-agent
**Skill:** ios-deployment
**Files:**
- Create: `BushelBoard/fastlane/Fastfile` (optional, for CI)
- Create: App Store Connect metadata (screenshots, description, keywords)

**Checklist:**
- [ ] App icons (all sizes)
- [ ] Launch screen
- [ ] Privacy Policy URL
- [ ] App Store description + keywords
- [ ] Screenshots (iPhone 15 Pro, iPhone 15, Watch)
- [ ] Privacy Nutrition Labels
- [ ] Review notes for App Store reviewer
- [ ] TestFlight internal group created

---

### Task 5.5: Phase 5 Gate

**Agents:** qc-crawler, security-auditor
**Checklist:**
- [ ] Watch app syncs data from iPhone
- [ ] Complications update hourly
- [ ] Haptic alerts fire on threshold cross
- [ ] Push notifications received on device
- [ ] App Store submission checklist complete
- [ ] TestFlight build uploaded and accessible

---

## Phase 6: Launch + Iterate (Week 10+)

**Agents:** ultra-agent (coordinator), qc-crawler, documentation-agent
**Skills:** All

### Task 6.1: TestFlight Beta

- Distribute to 10-20 farmers via TestFlight
- Monitor: crash reports, conversation logs, data extraction accuracy
- Collect feedback on analyst persona, response quality, UX

### Task 6.2: Persona Iteration

**Agent:** chat-architect
- Review conversation logs for persona quality
- Adjust system prompt based on farmer feedback
- A/B test response styles (more/less casual, longer/shorter)

### Task 6.3: LLM A/B Testing

**Agent:** chat-architect
- Route 10% of conversations through GPT-4o, Claude, Gemini
- Compare: return rate, data contributed, conversation depth, extraction accuracy
- Switch primary model if clear winner emerges

### Task 6.4: Scale Area Coverage

- Monitor FSA report counts
- Identify high-density areas for targeted elevator onboarding
- Adjacent FSA blending for sparse areas

### Task 6.5: Set Up Scheduled Tasks

**Claude Code Feature:** Scheduled tasks for ongoing operations
```
- Daily: persona quality spot-check (random 5 conversations)
- Weekly: data freshness audit (local_market_intel decay, elevator_prices staleness)
- Weekly: area coverage report (FSAs with <3 reports)
- Monthly: LLM cost analysis per model
```

### Task 6.6: Update STATUS.md + README.md + CLAUDE.md

**Agent:** documentation-agent
**Skill:** documentation-patrol
- Track 36 marked complete in STATUS.md
- README.md updated with iOS app section
- CLAUDE.md updated with iOS project structure, new agents, new skills

---

## Dependency Graph

```
Phase 0 (Foundation)
  ├── Task 0.1: Merge PR #4
  ├── Task 0.2: Create ios-dev agent
  ├── Task 0.3: Create chat-architect agent
  ├── Task 0.4: Create skills (ios-development, chat-persona)
  ├── Task 0.5: Modify existing agents
  └── Task 0.6: Xcode project skeleton
          │
Phase 1 (Core Chat) ── depends on Phase 0
  ├── Task 1.1: Auth (Sign in with Apple + email)
  ├── Task 1.2: Chat UI (Messages-like)
  ├── Task 1.3: Chat Edge Function ◄── critical path
  ├── Task 1.4: SSE Streaming Client ◄── depends on 1.3
  ├── Task 1.5: Navigation Shell
  └── Task 1.6: Phase 1 Gate
          │
Phase 2 (Flywheel) ── depends on Phase 1
  ├── Task 2.1: Migrations (local_market_intel, farmer_memory, area_stance RPC)
  ├── Task 2.2: Tool execution in chat-completion ◄── depends on 2.1
  ├── Task 2.3: Cold start / onboarding
  └── Task 2.4: Phase 2 Gate
          │
Phase 3 (Elevator) ── depends on Phase 2
  ├── Task 3.1: elevator_prices migration + operator role
  ├── Task 3.2: Operator signup + chat-paste parsing
  ├── Task 3.3: Photo-to-price pipeline
  ├── Task 3.4: Farmer-side elevator price access
  └── Task 3.5: Phase 3 Gate
          │
Phase 4 (Apple Intelligence) ── depends on Phase 1, parallel with Phases 2-3
  ├── Task 4.1: Foundation Models entity extraction
  ├── Task 4.2: Siri App Intents
  ├── Task 4.3: WidgetKit
  ├── Task 4.4: Live Activities + push
  ├── Task 4.5: Create apple-intelligence + ios-deployment skills
  └── Task 4.6: Phase 4 Gate
          │
Phase 5 (Watch + Polish) ── depends on Phase 4
  ├── Task 5.1: watchOS companion
  ├── Task 5.2: Complications + haptics
  ├── Task 5.3: Push notification infrastructure
  ├── Task 5.4: App Store submission prep
  └── Task 5.5: Phase 5 Gate
          │
Phase 6 (Launch) ── depends on Phase 5
  ├── Task 6.1: TestFlight beta
  ├── Task 6.2: Persona iteration
  ├── Task 6.3: LLM A/B testing
  ├── Task 6.4: Scale area coverage
  ├── Task 6.5: Scheduled tasks
  └── Task 6.6: Documentation updates
```

**Parallelism:** Phase 4 (Apple Intelligence) can run in parallel with Phases 2-3 since Foundation Models, Siri, and Widgets don't depend on the local intelligence flywheel. The only dependency is Phase 1 (core chat working).

---

## Summary: New Infrastructure Created

| Type | Name | Purpose |
|------|------|---------|
| **Agent** | `ios-dev` | Swift/SwiftUI development |
| **Agent** | `chat-architect` | Chat Edge Function + persona |
| **Skill** | `ios-development` | Swift patterns + project structure |
| **Skill** | `chat-persona` | Analyst persona + tool schemas |
| **Skill** | `apple-intelligence` | Foundation Models + Siri + Widgets |
| **Skill** | `ios-deployment` | TestFlight + App Store |
| **Skill** | `elevator-pricing` | Operator workflow + price extraction |
| **Edge Function** | `chat-completion` | LLM streaming + tool execution |
| **Edge Function** | `push-price-alert` | APNs price alerts |
| **Edge Function** | `push-notification-dispatch` | General push delivery |
| **Table** | `local_market_intel` | Farmer-reported local data |
| **Table** | `farmer_memory` | Persistent conversation context |
| **Table** | `elevator_prices` | Operator-posted grain prices |
| **Table** | `push_tokens` | Device push notification tokens |
| **RPC** | `get_area_stance_modifier` | Area-adjusted stance score |
| **RPC** | `get_elevator_prices_for_area` | Elevator prices by FSA |
| **Hook** | Pre-commit migration validator | Verify RLS, GRANTs, naming |
| **Scheduled Task** | Daily persona quality | Spot-check 5 random conversations |
| **Scheduled Task** | Weekly data freshness | Audit local_market_intel + elevator_prices |
