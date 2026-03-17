---
name: ux-patterns
description: Bushel Board UX patterns — 3-section page structure, farmer persona, mandatory review checklist, deleted components reference. Use when designing or reviewing any dashboard page layout.
---

# UX Patterns — Bushel Board

## Farmer Persona

- **Age range:** 35-65, mix of tech comfort levels
- **Device:** Primarily mobile (iPhone/Android), some desktop during office hours
- **Context:** Checking between tasks — in the truck, at the elevator, over morning coffee
- **Goal:** Quick status check: "How are my grains moving?" "What's the market doing?"
- **Pain point:** Information overload — too many numbers, charts, and jargon
- **Motivation:** Financial — better decisions = better prices = better livelihood
- **Trust:** Skeptical of slick tech; trust practical, proven tools
- **Language:** Use farmer-friendly language. No trader jargon. Plain-English insights with "What This Means" callouts.

## Page Structure (3-Section Pattern)

### Overview Page
1. **Prairie Snapshot** — hero metrics, at-a-glance status
2. **Community Pulse** — sentiment, farmer activity
3. **Market Intelligence** — AI thesis, signals, positioning

### Grain Detail Page
1. **Market Intelligence** — AI thesis, bull/bear cases, stance
2. **Supply & Movement** — pipeline velocity, deliveries, logistics
3. **Community Pulse** — sentiment voting, signal feed

### My Farm Page
- Personal delivery data, percentile badges, contracted positions
- Multi-grain sentiment voting
- Farm summary narrative

## Psychology Principles

1. **Hick's Law:** Reduce choices on initial view. Show 3-4 key grains, not all 16.
2. **Progressive Disclosure:** Overview → Detail → Deep Data. Three taps max.
3. **Variable Reward Schedule:** Different insights each visit (trending grains, alerts, community activity)
4. **Loss Aversion:** Frame as "You could be missing..." not "You should check..."
5. **Social Proof:** "243 farmers checked Canola prices today" — builds community
6. **Endowed Progress Effect:** Show farmers already partway through profile setup
7. **Zeigarnik Effect:** Incomplete farm profiles create pull to finish

## Engagement Framework (Trust-First)

- **Farm Profile Completion:** Progress bar for adding farm data
- **Benchmarking:** "Your region delivered 12% more canola than average this week"
- **Data freshness:** Show when data was last updated — farmers need to trust recency
- **AVOID:** Streaks, leaderboards, loss-aversion copy, addictive patterns. These erode trust.

## Mandatory Review Checklist

Run on EVERY UI change:

1. **Information hierarchy:** Does new content fit within the existing 3-section structure?
2. **Duplication check:** Does this duplicate data already shown in another component on the same page? If so, fold it in.
3. **First 5 seconds test:** What does a new user see above the fold? Is the most important content visible?
4. **Section visibility:** Can Market Intelligence (key differentiator) be reached without excessive scrolling?
5. **Mobile responsiveness:** Does the component work at 375px width?
6. **Vertical space budget:** Will this push other sections below the fold? Can it be collapsed or compacted?
7. **Deleted components check:** Does this recreate `signal-tape.tsx`, `disposition-bar.tsx`, or `insight-cards.tsx`? These were intentionally removed — see `components/dashboard/CLAUDE.md`.

## Confidence-Scaled Visualizations

Visual weight (position, size, opacity) MUST scale with conviction/confidence:
```
position = 50 + (target - 50) * (confidence / 100)
```

## SectionHeader Component

Shared canola left-accent section divider used across all dashboard pages. Located in `components/dashboard/`.

## Deleted Components (Do Not Recreate)

These were intentionally removed during UX hierarchy redesign:
- `signal-tape.tsx` — replaced by CompactSignalStrip
- `disposition-bar.tsx` — data folded into SupplyPipeline
- `insight-cards.tsx` — replaced by IntelligenceKpis
