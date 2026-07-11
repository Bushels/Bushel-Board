# Bushel Board design system — how to build with it

A **Tailwind v4 + shadcn/ui** component library for a Canadian prairie grain-market
dashboard. Wheat-toned palette, canola-orange primary, prairie-green for positive.
Style with **component props first, brand utility classes second** — there is no
separate CSS-in-JS layer.

## Setup

- **No provider/wrapper is required** — components are self-contained and read
  their colors from CSS custom properties defined in the design system stylesheet.
  Just import the component (e.g. `import { Button } from "<ds>"`) and render it.
- **The stylesheet must be present.** All tokens, fonts, and component utilities
  live in the DS stylesheet (`styles.css` → its `@import` closure). Without it
  everything falls back to browser defaults.
- **Dark mode:** add `class="dark"` to an ancestor (e.g. `<html>`/`<body>`). All
  semantic tokens (`background`, `card`, `primary`, `border`, …) flip automatically.
- **Fonts:** `font-body`/`font-sans` = **DM Sans** (UI text), `font-display` =
  **Fraunces** (headings), `font-mono` = monospace. They load from the stylesheet.

## The styling idiom

**1) Prefer component props for variants.** They carry the design language:
- `Button` — `variant` (`default | secondary | outline | ghost | destructive | link`), `size` (`sm | default | lg | icon`).
- `Badge` — `variant` (`default | secondary | outline | destructive | ghost`).
- `GlassCard` — `elevation` (1–3), `glow` (`canola | prairie | none`), `hover`.
- `MarketStanceBadge` — `stance` (`bullish | bearish | neutral`), `size` (`sm | lg`).
- `ActionBadge` — `action` (`haul | hold | price | watch`), `size`.
- `LogisticsStatPill` — `sentiment` (`positive | negative | neutral`).

**2) Use brand utility classes for layout and one-off styling.** The real token vocabulary:

| Purpose | Classes |
|---|---|
| Semantic surfaces | `bg-background` `text-foreground` `bg-card` `text-card-foreground` `bg-muted` `text-muted-foreground` `bg-accent` `border-border` `ring-ring` |
| Primary / state | `bg-primary` `text-primary-foreground` `bg-secondary` `text-secondary-foreground` `bg-destructive` |
| Brand palette | `text-canola` `bg-canola` · `text-prairie` `bg-prairie` (positive) · `text-warning` (amber) · `bg-wheat-50` … `bg-wheat-950` (and `text-wheat-*`, `border-wheat-*`) |
| Province accents | `text-province-ab` `text-province-bc` `text-province-sk` `text-province-mb` |
| Display font | `font-display` (Fraunces headings) · `font-body` (DM Sans) |
| Brand shadows | `shadow-elevation-1` `shadow-elevation-2` `shadow-elevation-3` · `shadow-canola-glow` `shadow-prairie-glow` · `shadow-underglow-canola` `shadow-underglow-prairie` |
| Numbers | `tabular-nums` (always use for figures so columns align) |
| Radius / motion | `rounded-md` `rounded-lg` `rounded-xl` `rounded-2xl` · `ease-spring` (the house easing) |

Opacity is expressed with the slash modifier on these tokens: `bg-prairie/15`,
`border-canola/30`, `text-muted-foreground/70`.

## Where the truth lives

- The bound DS stylesheet (`styles.css` and `_ds_bundle.css`) — defines every token
  and utility above; read it before inventing a class.
- Per component: `<Name>.prompt.md` (usage + examples) and `<Name>.d.ts` (typed props).

## One idiomatic example

```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent, Badge } from "<ds>";

<Card className="w-[340px]">
  <CardHeader>
    <CardTitle className="font-display">Canola — Week 31</CardTitle>
    <CardDescription>Primary deliveries · AB · SK · MB</CardDescription>
    <CardAction><Badge variant="secondary">Bullish</Badge></CardAction>
  </CardHeader>
  <CardContent>
    <div className="text-3xl font-bold tabular-nums">312.4 Kt</div>
    <p className="mt-1 text-sm text-prairie">+8.2% vs 5-year average</p>
  </CardContent>
</Card>
```
