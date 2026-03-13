---
name: theme-factory
description: "Apply a pre-built or custom color-and-font theme to any artifact — slides, docs, reports, HTML pages, dashboards. Use when the user says: 'theme this', 'change the colors', 'pick a color scheme', 'style this deck', 'make it look better', 'apply a theme', 'give it a different vibe', or asks for color/font suggestions for an existing artifact. Also trigger for 'I don't like the colors', 'make it more professional', or 'try a different palette'. Do NOT use when the user wants Anthropic's specific brand (use brand-guidelines instead), wants to create visual art (use canvas-design), or is building a design system from scratch (use design-system-management)."
license: Complete terms in LICENSE.txt
---

# Theme Factory

A curated collection of 10 professional themes with color palettes and font pairings, plus the ability to generate custom themes on the fly. Apply to any artifact — slides, documents, reports, HTML pages, dashboards.

## Workflow

1. **Show the showcase**: Display `theme-showcase.pdf` so the user can see all 10 themes visually. Do not modify this file.
2. **Ask for their choice**: Let the user pick a theme (or describe what they want for a custom theme).
3. **Wait for confirmation**: Get explicit selection before applying.
4. **Load the theme**: Read the chosen theme file from the `themes/` directory.
5. **Apply consistently**: Use the theme's colors and fonts throughout the entire artifact. Ensure proper contrast and readability.

## Available Themes

| # | Theme | Mood | Best for |
|---|-------|------|----------|
| 1 | Ocean Depths | Professional, calming | Corporate, finance, healthcare |
| 2 | Sunset Boulevard | Warm, vibrant | Creative, marketing, events |
| 3 | Forest Canopy | Natural, grounded | Sustainability, agriculture, education |
| 4 | Modern Minimalist | Clean, contemporary | Tech, SaaS, minimalist brands |
| 5 | Golden Hour | Rich, autumnal | Luxury, consulting, annual reports |
| 6 | Arctic Frost | Cool, crisp | Data, analytics, winter campaigns |
| 7 | Desert Rose | Soft, sophisticated | Fashion, wellness, lifestyle |
| 8 | Tech Innovation | Bold, modern | Startups, product launches, AI/ML |
| 9 | Botanical Garden | Fresh, organic | Food, hospitality, retail |
| 10 | Midnight Galaxy | Dramatic, cosmic | Entertainment, space/science, premium |

Each theme file in `themes/` contains hex codes for primary, secondary, accent, background, and text colors, plus font pairings for headers and body.

## Custom Themes

When none of the 10 built-in themes fit, create a custom theme:

1. Ask what mood or context the user wants (or infer from the content).
2. Generate a theme with the same structure: name, color palette (5-7 hex codes with roles), and font pairing.
3. Show the custom theme for review before applying.
4. Apply once confirmed.

## Examples

**Example 1: Theming a slide deck**
User says: "This deck looks boring, give it some life"
→ Show `theme-showcase.pdf`. User picks "Coral Energy" vibes → Load closest match (Sunset Boulevard) or create a custom Coral theme. Apply throughout.

**Example 2: Asking for suggestions**
User says: "What theme would work for a sustainability report?"
→ Recommend Forest Canopy or Botanical Garden. Explain why (earth tones, natural feel). Show showcase for comparison.

**Example 3: Custom theme request**
User says: "I want something with navy and gold, very executive"
→ Create a custom "Executive Navy" theme with navy primary, gold accent, cream background. Show for approval, then apply.

## Common Issues

- **Inconsistent application**: Every element in the artifact should use theme colors. Don't leave some slides/sections in the old colors while others use the new theme.
- **Poor contrast**: After applying a theme, verify text is readable against backgrounds. Dark text on dark backgrounds is a common mistake with dramatic themes like Midnight Galaxy.
- **Font availability**: Theme fonts must be available on the system. If a theme specifies a font that's not installed, fall back to a similar widely-available font.
- **Over-theming**: The theme provides colors and fonts, not layout changes. Don't restructure the content — just restyle what's there.
