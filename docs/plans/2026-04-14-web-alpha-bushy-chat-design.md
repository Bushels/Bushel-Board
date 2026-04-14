# Web Alpha: Bushy Chat-First — Design Doc

**Date:** 2026-04-14
**Status:** Approved
**Track:** 37 — Web Alpha (Bushy Chat-First)
**Purpose:** Convert the Bushel Board web dashboard into a Bushy chat-first interface for alpha testing while the iOS app awaits Mac/Xcode setup.

---

## Goal

Authenticated users land on a full-screen Bushy chat that calls the same `chat-completion` Supabase Edge Function as the iOS app, renders typed cards (MarketSummaryCard, TrustFooter, VerificationPromptCard), and is mobile-optimized for farmer phone testing on Safari/Chrome.

**One brain, two clients.** The web alpha and iOS app share identical backend logic — same system prompt, same tools, same gamified exchange, same trust footer. Farmer-reported data from web alpha conversations feeds the same `local_market_intel` and `farmer_memory` tables, so area data starts accumulating before iOS launches.

---

## Architecture

```
Farmer (iPhone Safari / Desktop Chrome)
       │
       ▼
Next.js App (Vercel) — chat-first layout
       │ fetch() with SSE
       ▼
Supabase Edge Function (chat-completion)
       │ same as iOS path
       ▼
Grok 4.20 + tools + context builder + Bushy persona
```

### What Changes

| Current | After pivot |
|---------|-------------|
| `/overview` is landing page | `/` is Bushy chat for authenticated users |
| `/advisor` is secondary page | Redirects to `/` |
| Chat calls Vercel API (`/api/advisor/chat`) | Chat calls Supabase Edge Function directly |
| Plain text message bubbles | Typed React cards (MarketSummary, Recommendation, TrustFooter) |
| No verification prompts | VerificationPromptCard with gamified buttons |
| No trust footer | TrustFooter with freshness + confidence |
| No source badges | SourceBadge inline tags |
| No quick chips | Quick chips from crop_plans above input |
| Desktop-first layout | Mobile-first, thumb-friendly |

---

## Layout

```
┌──────────────────────────────────────────┐
│  🌾 Bushels    [My Farm] [☰ More]       │  ← slim top bar
├──────────────────────────────────────────┤
│                                          │
│  [Chat fills the screen]                 │
│  WelcomeView / Messages / Cards          │
│                                          │
├──────────────────────────────────────────┤
│  [Wheat] [Canola] [My area] [Haul?]     │  ← quick chips
│  Ask Bushy...                    [Send]  │  ← composer
└──────────────────────────────────────────┘
```

- Slim top bar: "Bushels" branding + "My Farm" + hamburger for existing pages
- No sidebar, no tab bar — chat fills viewport
- Existing pages (Overview, grain detail, My Farm, US Markets) accessible via hamburger
- Mobile: full-width, safe-area padding, keyboard-aware composer

---

## Navigation

| Route | What | Priority |
|-------|------|----------|
| `/` | Bushy chat (authenticated) or landing page (unauthenticated) | Primary |
| `/my-farm` | Crop plans + deliveries (existing) | Secondary via hamburger |
| `/grain/[slug]` | Grain detail (existing) | Secondary via hamburger |
| `/overview` | Market overview (existing) | Tertiary via hamburger |
| `/advisor` | Redirect → `/` | Deprecated |

---

## Components

### New Components

| Component | File | What |
|-----------|------|------|
| `BushyChat` | `components/bushy/bushy-chat.tsx` | Full-screen chat client, SSE to Edge Function |
| `BushyWelcome` | `components/bushy/bushy-welcome.tsx` | Empty state: Bushy intro + privacy + starter chips |
| `BushyComposer` | `components/bushy/bushy-composer.tsx` | Text input + quick chips + send button |
| `WebMarketSummaryCard` | `components/bushy/cards/market-summary-card.tsx` | Stance badge + bullets + recommendation + trust footer |
| `WebRecommendationCard` | `components/bushy/cards/recommendation-card.tsx` | Action card with quick action buttons |
| `WebTrustFooter` | `components/bushy/cards/trust-footer.tsx` | Data freshness + report count + confidence badge |
| `WebSourceBadge` | `components/bushy/cards/source-badge.tsx` | Inline [local reports] [posted pricing] etc. |
| `WebVerificationPrompt` | `components/bushy/cards/verification-prompt.tsx` | Two-button gamified verification card |
| `WebQuickChips` | `components/bushy/quick-chips.tsx` | Horizontal scrolling chip bar |

### Modified Files

| File | Change |
|------|--------|
| `app/(dashboard)/page.tsx` or root layout | Render BushyChat as primary view |
| `app/(dashboard)/layout.tsx` | Slim down nav for chat-first |
| `components/layout/desktop-nav-links.tsx` | Remove advisor link, add "My Farm" shortcut |
| `components/layout/mobile-nav.tsx` | Same — hamburger for secondary pages |
| `app/(dashboard)/advisor/page.tsx` | Redirect to `/` |

### Existing Components (Keep As-Is)

The old `components/advisor/` directory stays for reference but the new `components/bushy/` replaces it for the active UI. Existing grain pages, My Farm, and Overview stay unchanged and accessible via hamburger.

---

## SSE Connection

Direct to Supabase Edge Function (same as iOS):

```typescript
const response = await fetch(
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/chat-completion`,
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message, thread_id: threadId }),
  }
);
```

SSE events parsed: `delta`, `tool_call`, `tool_result`, `verification_prompt`, `trust_footer`, `done`, `error`

---

## Card Rendering

The Edge Function returns structured JSON. Web client parses on `done` event:

```
accumulatedText → parseCardData()
  → type: "market_summary" → <WebMarketSummaryCard />
  → type: "recommendation" → <WebRecommendationCard />
  → else → plain text bubble + <WebTrustFooter /> if present
```

Verification prompts arrive as separate SSE events and render as `<WebVerificationPrompt />` with two tappable buttons.

---

## Deep Link Support

For testing push notification flows before iOS:
```
https://bushels.vercel.app/?prompt=Give+me+a+canola+update
```

The root page reads `searchParams.prompt`, passes to BushyChat, auto-sends on mount.

---

## Mobile Optimization

- `max-w-lg mx-auto` for message width (readable on phone)
- Composer sticky to bottom with `safe-area-inset-bottom` padding
- Quick chips horizontal scroll with `overflow-x-auto`
- Touch targets: 44px minimum on all buttons
- `scrollDismissesKeyboard` behavior (scroll up hides keyboard)
- No hover states — tap-only interactions

---

## iOS Transition Parity

The web alpha must be designed so the iOS transition is seamless — same data, same behavior, same persona.

### Shared (Web = iOS, no duplication)
- **Backend:** Both call the same `chat-completion` Edge Function
- **Data:** Both read/write the same tables (chat_threads, chat_messages, local_market_intel, farmer_memory, elevator_prices)
- **Persona:** Same system prompt, same Bushy voice, same gamified exchange
- **Tools:** Same 7 tool schemas, same executors, same data quality pipeline
- **Trust footer:** Same computation, same confidence levels

### Card Model Alignment

Web React components mirror iOS Swift structs 1:1:

| Web (React) | iOS (SwiftUI) | Shared Data Model |
|---|---|---|
| `WebMarketSummaryCard` | `MarketSummaryCard` | `MarketSummaryData` (grain, stanceBadge, takeaway, reasons[], recommendation, trustFooter) |
| `WebRecommendationCard` | `RecommendationCard` | `RecommendationData` (headline, explanation, actions[]) |
| `WebTrustFooter` | `TrustFooter` | `TrustFooterData` (cgcFreshness, futuresFreshness, localReportCount, confidence) |
| `WebSourceBadge` | `SourceBadge` | `SourceTag` enum (yourHistory, localReports, postedPricing, nationalMarket, sponsored) |
| `WebVerificationPrompt` | `VerificationPromptCard` | `VerificationPromptData` (grain, dataType, options[]) |
| `BushyComposer` | `ChatComposerView` | Quick chips array from crop_plans |
| `BushyWelcome` | `WelcomeView` | Same copy: "I'm Bushy — your farming buddy" + privacy message |

### SSE Event Parity

Both clients parse identical SSE events from the Edge Function:

| Event | Web handler | iOS handler |
|---|---|---|
| `delta` | Append text to message | `SSEClient.textDelta` |
| `tool_call` | Show status ("Saving your local intel...") | `SSEClient.toolCall` |
| `tool_result` | Silent (for LLM) | `SSEClient.toolResult` |
| `verification_prompt` | Render WebVerificationPrompt | `SSEClient.verificationPrompt` |
| `trust_footer` | Attach WebTrustFooter to message | `SSEClient.trustFooter` |
| `done` | Parse card data, finalize | `SSEClient.done` |
| `error` | Show error message | `SSEClient.error` |

### Migration Path

When iOS launches:
1. Farmers who used web alpha already have crop_plans, farmer_memory, and local_market_intel data
2. They sign into the iOS app with same Supabase auth (Apple ID or email)
3. Their chat history, memory, and area data carry over — Bushy remembers them
4. The web becomes a secondary companion (or is retired)

**No data migration needed.** Both clients use the same database.

---

## Out of Scope (Alpha)

| Feature | Why | When |
|---------|-----|------|
| Thread history/sidebar | One conversation at a time for alpha | Post-validation |
| Mic/photo input | Browser APIs unreliable on mobile Safari | iOS Phase 4B |
| Web push notifications | Unreliable on iOS Safari | iOS handles this |
| Operator price form | Chat-paste works for alpha | iOS Phase 3 form exists |
| Apple Intelligence | Browser doesn't have Foundation Models | iOS only |

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Farmer opens on iPhone Safari → sees Bushy | Works first try |
| Types question → gets MarketSummaryCard | <10s to first card |
| Trust footer shows real freshness data | Correct CGC/futures age |
| Verification prompt renders and functions | Tap → confidence updated |
| Quick chips load from crop_plans | Farmer's actual grains shown |
| `/?prompt=...` deep link works | Auto-sends on page load |
| Mobile portrait → one-thumb usable | No horizontal scroll, no tiny buttons |
