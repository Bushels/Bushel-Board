---
name: algorithmic-art
description: "Create interactive generative art using p5.js with seeded randomness and parameter exploration. Use when the user says: 'generative art', 'algorithmic art', 'make art with code', 'flow field', 'particle system', 'creative coding', 'p5.js art', 'procedural generation', or asks for code-based visual art, computational aesthetics, or interactive algorithmic compositions. Also trigger for 'make something beautiful with code', 'creative visualization', or 'generative design'. Do NOT use for static poster/print design (use canvas-design), data visualizations or charts (use data-visualization), animated GIFs for Slack (use slack-gif-creator), or simple HTML/CSS art without p5.js."
license: Complete terms in LICENSE.txt
---

Algorithmic philosophies are computational aesthetic movements expressed through code. Output .md files (philosophy), .html files (interactive viewer), and .js files (generative algorithms).

This happens in two steps:
1. Algorithmic Philosophy Creation (.md file)
2. Express by creating p5.js generative art (.html + .js files)

First, undertake this task:

## ALGORITHMIC PHILOSOPHY CREATION

Create an ALGORITHMIC PHILOSOPHY (not static images or templates) interpreted through computational processes, emergent behavior, mathematical beauty, seeded randomness, noise fields, organic systems, particles, flows, fields, forces, parametric variation, and controlled chaos.

### THE CRITICAL UNDERSTANDING
- What is received: Subtle input from the user — use as foundation, not constraint.
- What is created: An algorithmic philosophy/generative aesthetic movement.
- What happens next: The philosophy is EXPRESSED IN CODE — p5.js sketches that are 90% algorithmic generation, 10% essential parameters.

The philosophy must emphasize: Algorithmic expression. Emergent behavior. Computational beauty. Seeded variation.

### HOW TO GENERATE AN ALGORITHMIC PHILOSOPHY

**Name the movement** (1-2 words): "Organic Turbulence" / "Quantum Harmonics" / "Emergent Stillness"

**Articulate the philosophy** (4-6 paragraphs) expressing how it manifests through:
- Computational processes and mathematical relationships
- Noise functions and randomness patterns
- Particle behaviors and field dynamics
- Temporal evolution and system states
- Parametric variation and emergent complexity

**CRITICAL GUIDELINES:**
- **Avoid redundancy**: Each algorithmic aspect mentioned once.
- **Emphasize craftsmanship REPEATEDLY**: Stress that the final algorithm should appear meticulously crafted, labored over with care, the product of deep expertise — repeat this framing.
- **Leave creative space**: Specific about direction, concise enough for interpretive implementation choices.

### PHILOSOPHY EXAMPLES

**"Organic Turbulence"** — Chaos constrained by natural law. Flow fields driven by layered Perlin noise, thousands of particles following vector forces, trails accumulating into organic density maps. Color from velocity and density. The algorithm runs until equilibrium — a meticulously tuned balance.

**"Quantum Harmonics"** — Discrete entities exhibiting wave-like interference. Particles on a grid carrying phase values evolving through sine waves. Phase interference creates bright nodes and voids. Simple harmonic motion generates complex emergent mandalas. The result of painstaking frequency calibration.

**"Recursive Whispers"** — Self-similarity across scales. Branching structures subdividing recursively, constrained by golden ratios. L-systems generating forms both mathematical and organic. Every branching angle the product of deep mathematical exploration.

**The algorithmic philosophy should be 4-6 paragraphs.** Output as a .md file.

---

## DEDUCING THE CONCEPTUAL SEED

Before implementing, identify the subtle conceptual thread from the original request. The concept is a **subtle, niche reference embedded within the algorithm itself** — not literal, always sophisticated. Someone familiar should feel it intuitively; others simply experience masterful generative composition. Think like a jazz musician quoting another song through algorithmic harmony.

---

## P5.JS IMPLEMENTATION

### ⚠️ STEP 0: READ THE TEMPLATE FIRST

**CRITICAL: BEFORE writing any HTML:**
1. **Read** `templates/viewer.html` using the Read tool
2. **Use that file as the LITERAL STARTING POINT** — not inspiration
3. **Keep all FIXED sections** (header, sidebar structure, Anthropic colors/fonts, seed controls, action buttons)
4. **Replace only VARIABLE sections** (algorithm, parameters, UI controls for parameters)

### TECHNICAL REQUIREMENTS

**Seeded Randomness (Art Blocks Pattern)**:
```javascript
let seed = 12345;
randomSeed(seed);
noiseSeed(seed);
```

**Parameters** — emerge naturally from the philosophy. Think "what qualities of this system can be adjusted?" rather than pattern types. Include quantities, scales, probabilities, ratios, angles, thresholds.

**Core Algorithm** — let the philosophy dictate what to build:
- **Organic emergence** → accumulation, growth, feedback loops
- **Mathematical beauty** → geometric relationships, trigonometric harmonics
- **Controlled chaos** → random variation within strict boundaries, order from disorder

**Canvas Setup**: Standard p5.js, 1200x1200. Can be static (noLoop) or animated.

### CRAFTSMANSHIP REQUIREMENTS

Create algorithms that feel like they emerged through countless iterations by a master generative artist:
- **Balance**: Complexity without visual noise, order without rigidity
- **Color Harmony**: Thoughtful palettes, not random RGB
- **Composition**: Visual hierarchy and flow even in randomness
- **Performance**: Smooth real-time execution if animated
- **Reproducibility**: Same seed ALWAYS produces identical output

### OUTPUT FORMAT

1. **Algorithmic Philosophy** — Markdown explaining the generative aesthetic
2. **Single HTML Artifact** — Self-contained interactive art built from `templates/viewer.html`

### INTERACTIVE ARTIFACT — FIXED vs VARIABLE

**FIXED (keep exactly as shown in template):**
- Layout (header, sidebar, main canvas)
- Anthropic branding (colors, fonts, gradients)
- Seed section: display, prev/next, random, jump-to
- Actions section: regenerate, reset, download PNG

**VARIABLE (customize per artwork):**
- The p5.js algorithm (setup/draw/classes)
- The parameters object
- Parameter controls (sliders, inputs — number and type varies)
- Colors section (optional — some art needs pickers, some doesn't)

### REQUIRED FEATURES

1. **Parameter Controls** — sliders for numeric params, color pickers for palette, real-time updates, reset button
2. **Seed Navigation** — display, prev/next/random buttons, jump-to input
3. **Single Artifact** — everything inline in one HTML file, only external dependency is p5.js CDN

## RESOURCES

- **templates/viewer.html**: REQUIRED starting point for all HTML artifacts
- **templates/generator_template.js**: Reference for p5.js best practices and code structure

## Examples

**Example 1: Abstract landscape request**
User says: "Make me some generative art inspired by prairie fields"
→ Create "Wind Harvest" philosophy about undulating grain waves driven by Perlin noise. Particles trace wind currents across a golden-to-amber palette. Parameters: wind strength, grain density, noise scale.

**Example 2: Pure exploration**
User says: "Surprise me with something cool"
→ Choose a compelling philosophy like "Stochastic Crystallization" — random circle packing evolving through relaxation. Parameters: element count, relaxation speed, palette warmth.

## Common Issues

- **Canvas is blank**: Check that `setup()` calls `createCanvas()` and `draw()` or `noLoop()` is invoked correctly. Verify seed is set before any random/noise calls.
- **Parameters don't update**: Ensure slider `oninput` handlers call the regeneration function and that the parameter object is read inside draw/setup.
- **Slow performance**: Reduce particle count, use `noLoop()` for static art, or pre-compute expensive noise fields.
- **Template styling broken**: You likely modified a FIXED section. Re-read `templates/viewer.html` and restore the layout/branding.
