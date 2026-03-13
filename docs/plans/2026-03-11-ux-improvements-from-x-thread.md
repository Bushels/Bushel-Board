# Bushel Board — UX & Feature Improvements (from X Thread Review)

**Date:** 2026-03-11
**Source:** Kyle's X thread draft + self-review notes

---

## Priority 1 — UX / Layout Fixes

### 1. X Signal Feed takes too much vertical space on Overview
- **Problem:** The X post cards are large and push Market Pulse below the fold. Users may never scroll to it.
- **Proposed fix:** Make signal cards compact (1-2 lines each) with a horizontal scroll carousel. "See more" expands to full view.
- **Impact:** High — Market Pulse is a key differentiator and it's getting buried.
- **Files:** `components/dashboard/x-signal-feed.tsx`, Overview page layout

### 2. Missing visual section breaks on Overview
- **Problem:** Market Pulse, Community Sentiment, and X Feed all blend together. No clear section boundaries.
- **Proposed fix:** Add section headers with subtle dividers or card grouping. Consider a different background shade per section or a left-border accent using design tokens.
- **Impact:** Medium — improves scanability and reduces cognitive load.
- **Files:** Overview page layout, possibly shared `SectionHeader` component

### 3. Duplicate "Where does the canola go?" content
- **Problem:** The domestic disappearance breakdown and the "Where does the canola go?" card show overlapping data.
- **Proposed fix:** Merge into the supply pipeline map view. Show domestic disappearance as a layer/breakdown on the map alongside storage data.
- **Impact:** Medium — reduces clutter and makes the map more useful.
- **Files:** Grain detail page, `components/dashboard/supply-pipeline.tsx`, map component

### 4. Overall layout feels "jumbled"
- **Problem:** Information hierarchy isn't clear enough. Too many components competing for attention.
- **Proposed fix:** UX audit pass — establish clear information hierarchy: Thesis → KPIs → Interactive Data → Signals → Sentiment → Map. Increase whitespace between sections.
- **Impact:** High — first impression matters for beta retention.

---

## Priority 2 — Intelligence Improvements

### 5. Add a second LLM for stronger thesis/analysis
- **Problem:** Single-model analysis may miss perspectives or lack depth.
- **Proposed fix:** Add Claude Sonnet 4.6 as a complementary analysis engine alongside Grok. Could be used for:
  - Cross-validating Grok's thesis
  - Generating a "second opinion" perspective
  - Deeper structural analysis of supply/demand dynamics
- **Cost consideration:** Must evaluate per-token cost vs. insight value. Could run Sonnet only on weekly deep analysis (not intraday pulse) to control spend.
- **Impact:** High if cost-effective — differentiates the product significantly.
- **Files:** `supabase/functions/generate-intelligence/`, intelligence pipeline

---

## Priority 3 — UX Agent & Process Improvements

### 6. Strengthen UX Agent instructions
- **Problem:** UX issues (duplicates, layout problems, buried content) should be caught before they ship.
- **Proposed fix:** Update `.claude/agents/` UX agent instructions to include:
  - Mandatory checklist for every UI change (information hierarchy, duplication check, mobile responsiveness, section visibility)
  - "First 5 seconds" test — what does a new user see?
  - Content deduplication audit on every grain detail page
- **Impact:** Medium-long term — prevents UX debt from accumulating.
- **Files:** `.claude/agents/ux-agent.md` or equivalent

### 7. Add user analytics / session tracking
- **Problem:** No visibility into where users get stuck, what they skip, or how they navigate.
- **Proposed fix:** Integrate lightweight analytics (PostHog, Mixpanel, or Vercel Analytics + custom events). Track:
  - Page views and time on page
  - Scroll depth (are users reaching Market Pulse?)
  - Feature engagement (delivery logging, sentiment voting, signal voting)
  - Drop-off points in onboarding
  - Funnel: signup → acres entered → first delivery logged → first vote
- **Impact:** Critical for beta — need data to iterate intelligently.
- **Cost:** PostHog free tier or Vercel Analytics may be sufficient for beta.

---

## Summary Table

| # | Item | Priority | Effort | Impact |
|---|------|----------|--------|--------|
| 1 | Compact X Signal Feed + horizontal scroll | P1 | Medium | High |
| 2 | Visual section breaks on Overview | P1 | Low | Medium |
| 3 | Deduplicate canola/domestic disappearance | P1 | Medium | Medium |
| 4 | Overall layout hierarchy audit | P1 | High | High |
| 5 | Add Sonnet 4.6 as second analysis LLM | P2 | High | High |
| 6 | Strengthen UX Agent instructions | P3 | Low | Medium |
| 7 | Add user analytics / session tracking | P3 | Medium | Critical |

> **Recommendation:** Tackle items 1-4 before expanding beta invites. Items 5-7 are parallel workstreams that can run alongside the UX fixes.
