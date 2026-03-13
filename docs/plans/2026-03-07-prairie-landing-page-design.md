# Prairie Landing Page Design

**Date:** 2026-03-07
**Status:** Approved
**Scope:** Replace current landing page hero with an animated prairie landscape scene

## Overview

Transform the Bushel Board pre-auth landing page into an immersive golden-hour prairie scene. The animation serves as a homage to the agriculture industry — a wheat field swaying in the wind beneath a warm sunset sky. Built entirely in Canvas 2D, evolving the existing `GrainParticles` component.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Animation style | Prairie landscape scene | Evokes Canadian prairies, emotional connection for farmers |
| Mood | Golden hour warmth | Canola gold palette, hopeful, premium feel |
| Layout | Full-bleed hero background | Immersive, cinematic first impression |
| Rendering | Canvas 2D | Zero new dependencies, matches existing pattern, great perf |

## Scene Composition

### Layer 1 — Sky Gradient

- Golden hour gradient: deep amber at horizon → warm peach → soft blue at zenith
- Glowing sun disc just above the horizon line with radial light rays (soft gradient circle)
- Subtle animated cirrus clouds drifting slowly across the upper sky (2-3 wispy shapes)
- **Dark mode:** Shifts to dusk palette (deep indigo → burnt orange at horizon, stars optional)

### Layer 2 — Distant Hills (Parallax)

- 2-3 rolling hill silhouettes in muted earth tones
- Slight parallax shift on mouse movement (moves slower than foreground wheat)
- Rendered as bezier curves filled with semi-transparent earth colors
- Deepest hill is darkest/most muted, nearest hill has more color

### Layer 3 — Wheat Field (The Star)

- Dense field of individual wheat stalks drawn from bottom ~40% of canvas
- Each stalk composed of:
  - **Stem:** Thin bezier curve (1-2px)
  - **Head:** Small elongated oval at the top, slightly drooping
- **Wind physics:** Perlin/simplex noise-driven sway
  - Base sway: continuous gentle oscillation
  - Gusts: every 3-5s, a stronger wave ripples across left-to-right
  - Each stalk has a slightly different phase offset for organic feel
- **Mouse interaction:** Stalks near cursor gently lean away (parting effect)
- **Color variation:** Mix of canola gold (#D4A017), darker amber (#B8860B), light wheat (#F3E5AB)
- **Depth:** Front stalks are taller/larger/brighter, back stalks are shorter/more muted
- **Density:** ~200-400 stalks responsive to viewport width

### Layer 4 — Floating Particles

- Lighter version of existing gold grain particles drifting above the field
- Represents the data/intelligence layer of the product
- Reduced density from current GrainParticles implementation (~30-50 particles)
- Subtle golden glow, no cyan data nodes (all warm tones)

## Content Overlay

### Header (z-10)
- Sign In button top-right (existing pattern)
- Minimal — no logo in header (logo is in hero)

### Hero Section (centered, upper half of viewport)
- Logo at ~120px (reduced from current 240px to let scene breathe)
- **Headline:** "Deliver with Data." in Fraunces display font
  - White text with subtle text-shadow for readability over the scene
  - "with Data." in canola gold (#c17f24)
- **Subtext:** Existing description in DM Sans, wheat-100/semi-transparent white
- **CTA:** "Get Started" — canola gold background, white text, rounded-full
  - Warm glow shadow (`box-shadow` with canola color at low opacity)
- **Scroll indicator:** Subtle animated down-chevron at bottom of viewport

### Below the Fold (on scroll)
- Clean wheat-50 (#f5f3ee) background
- 3 existing feature cards (Track Inventory, Analyze Margins, Sell with Confidence)
- Existing footer

## Interactions

| Interaction | Behavior |
|-------------|----------|
| Mouse parallax | Moving cursor shifts hills slightly (1-2% of movement) |
| Mouse wheat parting | Stalks within ~100px of cursor lean away organically |
| Wind gusts | Every 3-5s, a wave of stronger sway ripples left-to-right |
| Scroll transition | Scene fades/translates up as user scrolls, revealing feature section |
| Reduced motion | Static golden gradient + illustration-style wheat silhouettes, no animation |

## Technical Approach

### Component: `PrairieScene`
- Replaces `GrainParticles` on the landing page
- Single `<canvas>` element, full viewport, positioned fixed behind content
- Single `requestAnimationFrame` loop rendering all layers

### Simplex Noise
- Inline implementation (~30 lines) for wind physics
- No external library needed
- Produces smooth, natural-looking oscillation

### Performance Targets
- 60fps on modern devices
- ~200-400 wheat stalks (scaled to `canvas.width / 5`)
- Canvas cleared and redrawn each frame
- Respects `prefers-reduced-motion` media query

### Files to Create/Modify
- `components/ui/prairie-scene.tsx` — New canvas component
- `app/page.tsx` — Replace GrainParticles with PrairieScene, update hero styling
- `components/ui/grain-particles.tsx` — Keep for potential reuse elsewhere, not deleted

### Dark Mode Behavior
- Sky: deep indigo (#1a1a3e) → burnt orange (#c2570a) at horizon
- Hills: darker silhouettes
- Wheat: slightly desaturated, cooler gold tones
- Sun: lower, more orange, dimmer glow
- Optional: a few subtle stars in upper sky

## Accessibility

- `prefers-reduced-motion`: disable all canvas animation, show static painted scene
- Canvas has `aria-hidden="true"` — purely decorative
- All interactive content is in DOM elements above the canvas
- Text has sufficient contrast via text-shadow over the scene
- CTA button meets WCAG AA contrast requirements

## Out of Scope

- Video backgrounds
- Sound/audio
- 3D / WebGL rendering
- Scroll-jacking (scroll behavior remains native)
- Mobile-specific scene variations (responsive density only)
