# design-sync notes — bushel-board-app

Repo-specific gotchas for syncing this design system to claude.ai/design. Read
before every re-sync.

## What this is

This repo is a **Next.js application**, not a packaged component library. There
is no compiled `dist/` of importable components. The sync targets a curated
**presentational subset** of `components/` (decided 2026-06-17): the shadcn
primitives in `components/ui/*` plus a few brand pieces. Server- and
data-coupled components are deliberately excluded.

## How the build is wired (non-standard — read this)

- **Shape:** `package`, run in **synth-entry mode** (no dist). Component list +
  bundle scope are driven entirely by config, not by `.d.ts` discovery.
- **Custom entry:** `.design-sync/ds-entry.tsx` re-exports ONLY the scoped
  components (so esbuild never pulls in `next/headers` / Supabase server code).
  Pass it via `--entry .design-sync/ds-entry.tsx`. `cfg.componentSrcMap` lists
  the curated card set; the entry's `export *` exposes compound sub-parts
  (CardHeader, TableRow, SelectTrigger…) to previews.
- **CSS is Tailwind v4 — the converter does NOT run Tailwind.** You MUST run
  `node .design-sync/build-css.mjs` to (re)generate `.design-sync/compiled.css`
  **before** every `package-build.mjs` / `resync.mjs` run. That file is
  `cfg.cssEntry`; the converter copies it to `_ds_bundle.css` and `styles.css`
  `@import`s it. `compiled.css` is gitignored (regenerated); `build-css.mjs` is
  committed.
- **`srcDir: "components"`** is required — the default srcRoot probe would pick
  `lib/` (first existing of src|lib|components) and mis-group/mis-enrich.
- **`tsconfig: "./tsconfig.json"`** lets esbuild resolve the `@/*` path alias.

### Exact build commands (from repo root)

```sh
node .design-sync/build-css.mjs
node .ds-sync/package-build.mjs --config .design-sync/config.json \
  --node-modules ./node_modules --entry .design-sync/ds-entry.tsx --out ./ds-bundle
node .ds-sync/package-validate.mjs ./ds-bundle
```

(`.ds-sync/` is the staged converter + its own node_modules incl. esbuild,
ts-morph, @types/react, playwright. Re-copy it from the skill base on a fresh
clone; it's gitignored.)

## Fonts

DM Sans (body) + Fraunces (display) are loaded via a remote Google Fonts
`@import` injected by `build-css.mjs` → surfaces as `[FONT_REMOTE]`
(informational, loads at runtime in each card). If brand-font fidelity matters
and the remote import doesn't render in the headless check, self-host the woff2
under `.design-sync/fonts/` and switch to `cfg.extraFonts`.

## Floor cards (by design, not failures)

- `GrainParticles`, `PrairieScene` — framer-motion / `<canvas>` decoratives that
  don't screenshot meaningfully. Left unauthored → floor card. Authorable later.

## Capture harness patch (RE-APPLY ON RE-SYNC — staged scripts are gitignored)

`GlassCard` and `GlassTooltip` animate in from `initial={{opacity:0}}` via
framer-motion. The capture/validate harness screenshots immediately after
`settle()`, freezing them mid-fade at opacity 0 (content invisible, shell only).
Fix applied to `.ds-sync/package-capture.mjs` `settle()` — after the fonts/images
await, add:

```js
await page.waitForTimeout(350).catch(() => {});
await page.evaluate(() => { try { document.getAnimations().forEach((a) => a.finish()); } catch {} }).catch(() => {});
```

`.ds-sync/` is re-copied from the skill base on a fresh clone / re-sync, so this
patch must be re-applied after staging (or `package-validate.mjs`'s render check
will re-flag GlassCard/GlassTooltip as `[RENDER_BLANK]`). The same fix belongs in
`package-validate.mjs`'s render check if its blanks recur.

## Grouping (cosmetic, accepted)

Doc `category:` frontmatter only overrides the group when the source-dir-derived
group is generic. `components/dashboard/*` derive group `dashboard` (so
SectionHeader + LogisticsStatPill land there despite `category: Brand`) and
`prairie-scene/index.tsx` derives `prairie-scene` (despite `category:
Decorative`). The four main groups (primitives/surfaces/brand/overlays = 19/23)
are clean. Fixing the tail would require forking `lib/source-kit.mjs` GENERIC_DIR
— not worth it. Leave as-is.

## Component authoring gotchas

- `GlassCard` does NOT accept a `style` prop — put layout styles on an inner
  wrapper div. Place glass components over a tinted background in previews so the
  translucency/elevation reads.
- `Select` uses Radix default `position="item-aligned"` (centers selected item
  over trigger). Faithful default; switch to `position="popper"` for a top-down list.
- `Avatar` images 404 in headless — always include `AvatarFallback` initials.

## Known render warns

_(none — render check clean after the harness patch above.)_

## Re-sync risks (watch-list)

- **Tailwind drift:** new utility classes in app components only reach designs
  after `build-css.mjs` is re-run. Always rebuild the CSS before the converter.
- **Synth-entry `.d.ts` weakness:** props are extracted from source via ts-morph
  (no shipped types). Complex generics may need `cfg.dtsPropsFor.<Name>`.
- **Remote fonts:** the Google Fonts `@import` is a network dependency at render
  time; if it's blocked, cards fall back to system fonts (still legible).
- **Scope creep:** if `components/ui/*` gains new primitives, add them to
  `ds-entry.tsx` + `componentSrcMap` (they are NOT auto-discovered in this setup).
- **Login:** project create + upload need `claude.ai/design` scopes via `/login`.
