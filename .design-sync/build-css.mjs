// design-sync brand stylesheet compiler.
//
// The converter (package-build.mjs) reads cfg.cssEntry as a STATIC file — it
// never runs Tailwind. This app's styling is Tailwind v4 (utility classes
// generated at build time from app/globals.css's @theme tokens), so we must
// compile a standalone stylesheet here that (a) defines every brand token
// (wheat palette, canola, prairie, shadows, fonts) and (b) contains every
// utility class used by the synced components + their preview cards.
//
// Output: .design-sync/compiled.css  (gitignored — regenerated on every run).
// Run this BEFORE package-build.mjs / resync.mjs. See NOTES.md.
//
// Usage: node .design-sync/build-css.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const fwd = (p) => p.split(path.sep).join('/');

// Brand fonts: globals.css maps --font-body → var(--font-dm-sans) etc., which
// Next.js injects at runtime via next/font. In a standalone bundle those vars
// don't exist, so define real family stacks and load the webfonts remotely
// (surfaces as [FONT_REMOTE] — informational; loads at runtime in the card).
const FONT_IMPORT =
  "@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&display=swap');\n";
const FONT_VARS = `
/* design-sync: standalone brand font families (next/font vars don't exist outside the app) */
:root {
  --font-dm-sans: 'DM Sans', ui-sans-serif, system-ui, -apple-system, sans-serif;
  --font-fraunces: 'Fraunces', ui-serif, Georgia, 'Times New Roman', serif;
  --font-geist-mono: ui-monospace, 'SF Mono', 'SFMono-Regular', 'Menlo', monospace;
}
`;

// Scan the synced component sources + their authored preview cards so every
// utility a card can use is generated. Broad-scanning components/** keeps the
// sheet stable across preview edits.
const SOURCES = [
  `${fwd(repo)}/components/**/*.tsx`,
  `${fwd(here)}/previews/**/*.tsx`,
  `${fwd(here)}/ds-entry.tsx`,
];

// Safelist — designs built with this DS consume the STATIC compiled stylesheet
// (Tailwind is not re-run downstream), so every brand utility named in
// conventions.md must be force-generated here even if no synced component uses
// it. Keep this in sync with conventions.md's vocabulary table.
const SAFELIST = [
  '{bg,text,border}-wheat-{50,100,200,300,400,500,600,700,800,900,950}',
  '{bg,text,border}-{canola,prairie}',
  '{bg,border}-{canola,prairie}/{10,15,20,30,40}',
  'text-{canola,prairie}/{70,80}',
  '{bg,text}-{warning,success,error}',
  '{bg,text}-province-{ab,bc,sk,mb}',
  'shadow-elevation-{1,2,3}',
  'shadow-{canola,prairie}-glow',
  'shadow-{canola,prairie}-glow-hover',
  'shadow-underglow-{canola,prairie}',
  'font-{display,body,sans,mono}',
  'bg-{background,card,popover,primary,secondary,muted,accent,destructive}',
  '{text,border}-{foreground,card-foreground,muted-foreground,primary,primary-foreground,secondary-foreground,accent-foreground,destructive,border,ring}',
  'tabular-nums',
  'rounded-{md,lg,xl,2xl,3xl,full}',
  'ease-spring',
].join(' ');

let globals = fs.readFileSync(path.join(repo, 'app/globals.css'), 'utf8');

const input =
  FONT_IMPORT +
  globals +
  FONT_VARS +
  SOURCES.map((s) => `@source "${s}";`).join('\n') +
  '\n' +
  `@source inline("${SAFELIST}");\n`;

const inputPath = path.join(here, '.compiled-input.css');
fs.writeFileSync(inputPath, input);

const postcss = (await import('postcss')).default;
const tailwind = (await import('@tailwindcss/postcss')).default;

const res = await postcss([tailwind()]).process(input, { from: inputPath });
const outPath = path.join(here, 'compiled.css');
fs.writeFileSync(outPath, res.css);
fs.rmSync(inputPath, { force: true });

console.error(`[build-css] wrote ${path.relative(repo, outPath)} (${(res.css.length / 1024).toFixed(0)} KB)`);
