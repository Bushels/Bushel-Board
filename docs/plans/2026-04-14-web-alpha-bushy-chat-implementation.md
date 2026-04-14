# Web Alpha: Bushy Chat-First — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert the Bushel Board web dashboard to a Bushy chat-first interface that calls the same Supabase Edge Function as the iOS app, renders typed cards, and is mobile-optimized.

**Architecture:** Replace the Vercel API route advisor chat with a direct Supabase Edge Function SSE client. New `components/bushy/` directory mirrors the iOS card system. Chat becomes the authenticated landing page.

**Tech Stack:** Next.js 16, React, Tailwind CSS, shadcn/ui, Supabase SSR, SSE fetch streaming

**Design Doc:** `docs/plans/2026-04-14-web-alpha-bushy-chat-design.md`

---

## Task 1: Create Bushy Component Directory + SSE Client

**Files:**
- Create: `components/bushy/use-bushy-sse.ts` — React hook for SSE streaming to Edge Function
- Create: `components/bushy/types.ts` — Shared types matching iOS card models

**use-bushy-sse hook:**
- `useBushySSE()` returns `{ sendMessage, messages, isLoading, threadId }`
- Calls `chat-completion` Edge Function directly via `fetch` with SSE
- Parses events: delta, tool_call, verification_prompt, trust_footer, done, error
- Manages thread state (thread_id persists across messages)
- Gets access token from Supabase browser client

**types.ts:**
- `MessageContent` union: plainText | marketSummary | recommendation | verificationPrompt | statusLine
- `MarketSummaryData`, `RecommendationData`, `TrustFooterData`, `VerificationPromptData` — matching iOS structs
- `SourceTag` enum, `ConfidenceLevel` enum
- `SSEEvent` union type

**Verification:**
- Hook compiles with no TypeScript errors
- Types match iOS Swift models 1:1

---

## Task 2: Build Card Components

**Files:**
- Create: `components/bushy/cards/market-summary-card.tsx`
- Create: `components/bushy/cards/recommendation-card.tsx`
- Create: `components/bushy/cards/trust-footer.tsx`
- Create: `components/bushy/cards/source-badge.tsx`
- Create: `components/bushy/cards/verification-prompt.tsx`

**Implementation:**
- All components use Tailwind + shadcn/ui primitives
- Design tokens from existing system (wheat palette, canola accent, glass shadows)
- MarketSummaryCard: stance badge (colored pill) + takeaway + reason bullets with SourceBadge + recommendation + optional follow-up ask + TrustFooter
- TrustFooter: freshness line + confidence badge (Early/Solid/Strong read) + expandable "Why this read?" sheet (use shadcn Sheet or Collapsible)
- SourceBadge: small pill with icon + label, muted colors
- VerificationPrompt: two large buttons ("This is what I actually paid" / "I'm just kidding around"), tapping sends confirmation message back through SSE

**Verification:**
- Each card renders with mock data
- Stance badge colors match confidence level
- Verification buttons call sendMessage with verification response

---

## Task 3: Build BushyChat + Composer + Welcome

**Files:**
- Create: `components/bushy/bushy-chat.tsx` — Full-screen chat client component
- Create: `components/bushy/bushy-composer.tsx` — Input + quick chips + send
- Create: `components/bushy/bushy-welcome.tsx` — Empty state (Bushy intro + privacy + starters)
- Create: `components/bushy/quick-chips.tsx` — Horizontal scrolling chips
- Create: `components/bushy/message-bubble.tsx` — Message renderer with card dispatch

**bushy-chat.tsx ("use client"):**
- Uses `useBushySSE` hook for streaming
- Renders message list with auto-scroll
- Dispatches to card components based on `cardData` type
- Loads quick chips from `crop_plans` table via Supabase browser client
- Handles `initialPrompt` prop for deep-link support
- Mobile-optimized: full-height viewport, keyboard-aware

**bushy-composer.tsx:**
- Textarea (auto-resize, max 4 lines) + Send button
- Quick chips bar above input (horizontal scroll)
- Enter to send, Shift+Enter for newline
- Disabled during loading

**bushy-welcome.tsx:**
- Leaf icon + "Hey, I'm Bushy." (Fraunces font)
- "I'm your farming buddy..." intro
- Privacy transparency message
- Three starter chips (same as iOS: "Should I be hauling my wheat?", etc.)

**Verification:**
- Chat renders on mobile viewport (375px width)
- Welcome state shows for new user
- Typing + sending shows status line → streamed response
- Cards render correctly when card data is present

---

## Task 4: Rewire Layout — Chat IS the Landing Page

**Files:**
- Modify: `app/(dashboard)/page.tsx` — Replace overview content with BushyChat
- Modify: `app/(dashboard)/layout.tsx` — Slim nav for chat-first
- Modify: `components/layout/desktop-nav-links.tsx` — Remove advisor, simplify
- Modify: `components/layout/mobile-nav.tsx` — Hamburger for secondary pages
- Create: `app/(dashboard)/advisor/page.tsx` — Redirect to `/`

**Layout changes:**
- Dashboard root (`/`) renders `<BushyChat />` as primary content
- Nav slimmed: "Bushels" logo + "My Farm" shortcut + hamburger (Overview, Grains, US Markets)
- Remove "Advisor" from nav (it IS the page now)
- Container: remove `max-w-7xl` padding for chat — let it fill width on mobile
- Deep-link: read `searchParams.prompt` and pass as `initialPrompt` to BushyChat

**Verification:**
- Authenticated user navigates to `/` → sees Bushy chat (not overview)
- `/advisor` redirects to `/`
- Existing pages still accessible via hamburger menu
- Mobile nav works correctly

---

## Task 5: Quick Chips from crop_plans

**Files:**
- Modify: `components/bushy/bushy-chat.tsx` — Load chips on mount

**Implementation:**
- On mount, query `crop_plans` for current user's current crop year
- Extract grain names → prepend to default chips ["Haul or hold?", "My area", "Basis check"]
- If no crop plans: show ["Wheat", "Canola", "Haul or hold?", "My area"]
- Use Supabase browser client (createBrowserClient from @supabase/ssr)

---

## Task 6: Mobile Polish + Verification

**Files:**
- Various CSS/Tailwind adjustments

**Checklist:**
- [ ] Composer sticky to bottom with safe-area padding
- [ ] Messages scroll correctly, auto-scroll to newest
- [ ] Keyboard doesn't cover composer on mobile Safari
- [ ] Quick chips scroll horizontally without page scroll
- [ ] Touch targets ≥44px on all interactive elements
- [ ] Cards readable at 375px width (iPhone SE)
- [ ] Trust footer text doesn't overflow
- [ ] Verification prompt buttons full-width, easy to tap
- [ ] Loading status line centered with spinner
- [ ] Deep-link: `/?prompt=Give+me+a+canola+update` auto-sends on mount

---

## Task 7: Gate — Build + Test + Visual Verify

- [ ] `npm run build` passes
- [ ] `npm run test` passes (all 214 tests)
- [ ] Chat renders on iPhone Safari (test via Vercel preview)
- [ ] MarketSummaryCard renders with stance badge, bullets, trust footer
- [ ] VerificationPrompt renders and functions
- [ ] Quick chips load from crop_plans
- [ ] Deep-link prompt works
- [ ] Existing pages (Overview, grain detail, My Farm) still accessible
- [ ] No console errors on chat page
