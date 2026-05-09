#!/usr/bin/env tsx
/**
 * Cohesion-audit mockup generator.
 *
 * Produces Stitch-generated UI mockups for two Bushel Board surfaces:
 *   1. /seeding (new) — the Crop Pulse Seismograph design
 *   2. /overview (existing) — for cohesion comparison
 *
 * Each surface gets:
 *   - 1 base screen
 *   - 3 variants exploring LAYOUT and COLOR_SCHEME
 *
 * Output: docs/plans/mockups/2026-04-27-cohesion-audit/
 *   - <surface>-base.html + .png
 *   - <surface>-variant-{1,2,3}.html + .png
 *   - manifest.json (catalogue of generated screens)
 *
 * Usage:
 *   STITCH_API_KEY=<key> npx tsx scripts/generate-cohesion-mockups.ts
 *
 * Or with --help for full options.
 */

import { stitch } from "@google/stitch-sdk";
import { writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const OUT_DIR = resolve(
  process.cwd(),
  "docs/plans/mockups/2026-04-27-cohesion-audit"
);

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const DESIGN_TOKENS = `
Design tokens (must adhere strictly):
- Background: wheat-50 (#f5f3ee) light, wheat-900 (#2a261e) dark
- Primary accent: canola gold (#c17f24)
- Success: prairie green (#437a22)
- Warning: amber (#d97706)
- Body font: DM Sans
- Display font: Fraunces
- Section pattern: SectionHeader with canola left-accent vertical bar (3px), Fraunces title, DM Sans subtitle
- Card pattern: GlassCard — soft wheat-100 background with subtle shadow, 16px radius, 24px padding
- Voice: farmer-friendly. No trader jargon. Direct, declarative.
`.trim();

const SEEDING_PROMPT = `
A Next.js dashboard page at route /seeding called "Weekly Seeding Progress".
Audience: Canadian prairie farmers and US grain traders checking weekly crop progress.

${DESIGN_TOKENS}

Page structure (top to bottom):
1. SectionHeader: title "Weekly Seeding Progress", subtitle "USDA NASS week ending April 26, 2026 — US grain belt"
2. Amber-banner placeholder: "Provincial seeding data starts mid-May — AB/SK/MB will appear here as crop reports release"
3. Crop selector dropdown: "Showing: Corn" (options Corn, Soybeans, Wheat, Barley, Oats)
4. A wide GlassCard containing:
   - A US map of the grain belt (Mapbox light-v11 style, no labels) with ~15 small "seismograph" glyphs anchored at state centroids
   - Each glyph is a 64×48px microchart showing:
     - State code (2-letter) + crop name + condition arrow at top
     - Stacked horizontal area chart of planted/emerged/harvested over weeks
     - A canola-gold vertical scan-line marking the current week
     - A condition indicator line below (thickness = condition rating)
   - Glyphs use canola gold for planted, lighter gold for emerged, prairie green for harvested
5. Beneath the map: a horizontal week scrubber (slider) with weeks W14 through W46, current week marker (canola dot), and a "Replay season" play button
6. A small Legend card to the right of the map explaining glyph encoding

Mood: confident, editorial, professional. No emojis. No decorative imagery.
Density: information-rich but ample whitespace. Map is the hero element.
`.trim();

const OVERVIEW_PROMPT = `
A Next.js dashboard home page at route /overview for Bushel Board.
Audience: Canadian prairie farmers (AB, SK, MB) checking weekly grain market intelligence.

${DESIGN_TOKENS}

Page structure (top to bottom):
1. SectionHeader: title "AI Market Stance", subtitle "Weekly bullish/bearish scoring across prairie grains and US markets"
2. A large GlassCard containing a unified stance chart:
   - 16 Canadian grains + 4 US markets along the y-axis (smaller text on left)
   - A horizontal bar for each, colored by stance: prairie green for bullish (+20 to +100), amber for neutral (-20 to +20), red/crimson for bearish (-100 to -20)
   - Each bar shows the stance score number on the right
   - A short bull/bear summary tag below the bar in muted text
3. Footer note: "Updated weekly Friday evening · Source: Claude Agent Desk swarm"

Mood: confident, slightly editorial. No emojis. Information-dense but clean.
Hero element: the unified stance bar chart.
`.trim();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface MockupRecord {
  surface: string;
  variant: string;
  screenId: string;
  htmlUrl: string;
  imageUrl: string;
  prompt: string;
  variantPrompt?: string;
}

async function downloadTo(url: string, filePath: string): Promise<void> {
  process.stderr.write(`  ↓ ${filePath.split(/[/\\]/).pop()}\n`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} downloading ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(filePath, buf);
}

async function generateForSurface(
  projectId: string,
  surface: "seeding" | "overview",
  basePrompt: string,
): Promise<MockupRecord[]> {
  const records: MockupRecord[] = [];

  process.stderr.write(`\n=== Generating /${surface} ===\n`);
  const project = stitch.project(projectId);
  const baseScreen = await project.generate(basePrompt, "DESKTOP");

  process.stderr.write(`  base screen ${baseScreen.id}\n`);

  const baseHtml = await baseScreen.getHtml();
  const baseImg = await baseScreen.getImage();
  await downloadTo(baseHtml, resolve(OUT_DIR, `${surface}-base.html`));
  await downloadTo(baseImg, resolve(OUT_DIR, `${surface}-base.png`));

  records.push({
    surface,
    variant: "base",
    screenId: baseScreen.id,
    htmlUrl: baseHtml,
    imageUrl: baseImg,
    prompt: basePrompt,
  });

  const variantPrompt =
    "Explore alternate layouts and color treatments while staying within the wheat/canola/prairie palette and Fraunces+DM Sans fonts. Vary information density, hero element placement, and how the dashboard breathes.";

  const variants = await baseScreen.variants(
    variantPrompt,
    {
      variantCount: 3,
      creativeRange: "EXPLORE",
      aspects: ["LAYOUT", "COLOR_SCHEME"],
    },
  );

  for (let i = 0; i < variants.length; i++) {
    const v = variants[i];
    const idx = i + 1;
    process.stderr.write(`  variant ${idx} ${v.id}\n`);
    const html = await v.getHtml();
    const img = await v.getImage();
    await downloadTo(html, resolve(OUT_DIR, `${surface}-variant-${idx}.html`));
    await downloadTo(img, resolve(OUT_DIR, `${surface}-variant-${idx}.png`));
    records.push({
      surface,
      variant: `variant-${idx}`,
      screenId: v.id,
      htmlUrl: html,
      imageUrl: img,
      prompt: basePrompt,
      variantPrompt,
    });
  }

  return records;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function printHelp(): void {
  process.stderr.write(`
generate-cohesion-mockups — Stitch mockup generator for Bushel Board cohesion audit

Usage:
  STITCH_API_KEY=<key> npx tsx scripts/generate-cohesion-mockups.ts [--seeding-only|--overview-only]

Output:
  docs/plans/mockups/2026-04-27-cohesion-audit/
    <surface>-base.html + .png
    <surface>-variant-{1,2,3}.html + .png
    manifest.json
`.trim() + "\n");
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    return;
  }

  const onlySeeding = argv.includes("--seeding-only");
  const onlyOverview = argv.includes("--overview-only");

  if (!process.env.STITCH_API_KEY) {
    process.stderr.write(
      "ERROR: STITCH_API_KEY env var not set. See --help.\n",
    );
    process.exit(2);
  }

  await mkdir(OUT_DIR, { recursive: true });

  process.stderr.write(`Stitch SDK ready. Output → ${OUT_DIR}\n`);

  const project = await stitch.createProject(
    "Bushel Board cohesion audit 2026-04-27",
  );
  process.stderr.write(`Stitch project ${project.id} created\n`);

  const all: MockupRecord[] = [];

  if (!onlyOverview) {
    const seedingRecords = await generateForSurface(
      project.id,
      "seeding",
      SEEDING_PROMPT,
    );
    all.push(...seedingRecords);
  }

  if (!onlySeeding) {
    const overviewRecords = await generateForSurface(
      project.id,
      "overview",
      OVERVIEW_PROMPT,
    );
    all.push(...overviewRecords);
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    projectId: project.id,
    mockups: all.map((r) => ({
      surface: r.surface,
      variant: r.variant,
      screenId: r.screenId,
      pngFile: `${r.surface}-${r.variant}.png`,
      htmlFile: `${r.surface}-${r.variant}.html`,
    })),
  };

  await writeFile(
    resolve(OUT_DIR, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );

  process.stdout.write(JSON.stringify(manifest, null, 2) + "\n");
  process.stderr.write(`\n✓ Done. ${all.length} mockups in ${OUT_DIR}\n`);
}

main().catch((err) => {
  process.stderr.write(`FATAL: ${err.message}\n`);
  if (err.stack) process.stderr.write(err.stack + "\n");
  process.exit(1);
});
