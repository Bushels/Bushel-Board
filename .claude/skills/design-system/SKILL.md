---
name: design-system
description: Bushel Board visual design system — tokens, animation principles, component standards, glassmorphism, dark mode. Reference when building or modifying any UI component.
---

# Design System — Bushel Board

## Color Palette

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| wheat-50 | #f5f3ee | — | Page background |
| wheat-900 | #2a261e | background | Dark mode background |
| canola | #c17f24 | #d4983e | Primary actions, links |
| prairie | #437a22 | #5a9e30 | Success, positive values |
| error | #b33a3a | #c44 | Negative values |
| warning/amber | #d97706 | — | Warning states |
| province-ab | #2e6b9e | — | Alberta |
| province-sk | #6d9e3a | — | Saskatchewan |
| province-bc | #2f8f83 | — | British Columbia |
| province-mb | #b37d24 | — | Manitoba |

## Typography

- **Body:** DM Sans — clean, modern, excellent readability
- **Display:** Fraunces — distinctive serif for headings, gives agricultural warmth
- **Numbers:** Always use `tabular-nums` class for alignment
- **CSS opacity on hex vars:** Never use `hsl(var(--color) / opacity)` — our CSS custom properties are hex values. Use `color-mix(in srgb, var(--color-name) 65%, transparent)` for opacity.

## Spacing & Radius

- **Default radius:** 0.625rem (10px)
- **Hero cards:** 1rem (16px)
- **Badges/pills:** Pill radius (full rounded)

## Shadows (Warm-Tinted)

Use wheat-900 at low opacity, NOT pure black.

- **shadow-sm:** `0 2px 8px rgba(0,0,0,0.04)`
- **shadow-md:** `0 4px 16px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)`
- **shadow-lg:** `0 8px 32px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)`

## Animation & Motion

### Easing
Golden curve for ALL animations: `cubic-bezier(0.16, 1, 0.3, 1)`

### Timing
- **Micro interactions (hover):** 120ms
- **Transitions:** 300ms
- **Entrances:** 480ms
- **Stagger between siblings:** 40ms

### Principles
1. **Purpose:** Every animation communicates something — state change, hierarchy, attention
2. **Subtlety:** If a user notices the animation, it's too much
3. **Performance:** Only animate `transform` and `opacity`. Never `width`, `height`, `top/left`
4. **Consistency:** Same easing curve everywhere. Same stagger timing.
5. **Respect:** Honor `prefers-reduced-motion`. All animations must have zero-motion fallback.

### Framer Motion Patterns
- **Ease arrays need `as const`:** `ease: [0.16, 1, 0.3, 1] as const` — without it, TypeScript infers `number[]` which doesn't satisfy `Easing` type
- **Spring physics on interactive elements:** `whileTap={{ scale: 0.95 }}`, `whileHover={{ scale: 1.02 }}`
- **Use `useReducedMotion()` hook** from framer-motion

## Glassmorphism

- **Blur:** `backdrop-filter: blur(16px)` with semi-transparent backgrounds
- **Nav and overlays:** Glass effect
- **GlassCard + GlassTooltip:** Components in `components/ui/`

## Component Standards

- **Cards:** 1px border, subtle shadow at rest. Hover: lift + deeper shadow + primary border glow
- **Buttons:** Hierarchy: primary (canola fill), secondary (outline), ghost (no border). 44px min touch target.
- **Tables:** Alternating row backgrounds. Hover highlights full row. Sticky header with glass blur.
- **Charts:** Consistent color per grain. Tooltip matches card design. Interactive legend. Recharts: every `<Line>`/`<Area>` must specify `yAxisId` when multiple `<YAxis>` exist. CSS vars don't resolve in SVG `fill` — use hex.
- **Progress bars:** Golden easing fill. 6px default, 4px compact. Rounded ends.
- **Badges:** Pill shape. Status colors. text-xs, compact padding.
- **Loading:** Skeleton screens matching final layout. Pulse animation. Never spinners.

## Dark Mode

Not inversion — carefully calibrated warmth:
- Background: wheat-900 (#2a261e), not pure black
- Primary becomes lighter (#d4983e) for contrast
- Shadows become more subtle (lower opacity)
- Glass effects get darker backdrop
