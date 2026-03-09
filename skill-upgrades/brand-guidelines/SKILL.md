---
name: brand-guidelines
description: "Apply Anthropic's official brand colors, typography, and visual identity to artifacts. Use when the user says: 'make it look like Anthropic', 'apply brand colors', 'use Anthropic styling', 'brand this', 'corporate identity', 'Anthropic theme', or requests Anthropic's look-and-feel on slides, docs, HTML pages, or other deliverables. Also trigger when styling presentations, reports, or landing pages that should match Anthropic's visual standards. Do NOT use for non-Anthropic brand work, generic color theming (use theme-factory instead), or when the user specifies their own custom brand colors."
license: Complete terms in LICENSE.txt
---

# Anthropic Brand Styling

Apply Anthropic's official brand identity to any artifact — slides, documents, HTML pages, or visuals. This skill provides the canonical color palette, typography, and application rules so every deliverable looks on-brand.

## Color Palette

| Role | Hex | Usage |
|------|-----|-------|
| Dark | `#141413` | Primary text, dark backgrounds |
| Light | `#faf9f5` | Light backgrounds, text on dark |
| Mid Gray | `#b0aea5` | Secondary elements, borders |
| Light Gray | `#e8e6dc` | Subtle backgrounds, dividers |
| Orange (accent) | `#d97757` | Primary accent, CTAs, highlights |
| Blue (accent) | `#6a9bcc` | Secondary accent, links, info |
| Green (accent) | `#788c5d` | Tertiary accent, success states |

## Typography

| Element | Font | Fallback | Size guidance |
|---------|------|----------|--------------|
| Headings | Poppins | Arial | 24pt+ for titles, 18-20pt for section heads |
| Body text | Lora | Georgia | 11-14pt depending on medium |

Fonts should be pre-installed. If unavailable, fallbacks engage automatically — the design still looks professional.

## Application Rules

1. **Dominance**: Dark (`#141413`) or Light (`#faf9f5`) should cover 60-70% of visual space. Accents are supporting, never dominant.
2. **Contrast**: Always pair Dark text on Light backgrounds (or vice versa). Never place Mid Gray text on Light Gray backgrounds.
3. **Accent cycling**: When multiple accent elements appear, cycle Orange → Blue → Green to maintain visual interest.
4. **Headings**: Always Poppins (or Arial fallback). Always Dark or Light depending on background. Never use accent colors for heading text.
5. **Body**: Always Lora (or Georgia fallback). Maintain consistent size within a document.

## Examples

**Example 1: Branding a slide deck**
User says: "Make this deck look like Anthropic"
→ Apply `#141413` dark background on title/conclusion slides, `#faf9f5` light background on content slides. Headings in Poppins, body in Lora. Accent shapes cycle through Orange, Blue, Green.

**Example 2: Styling an HTML page**
User says: "Apply Anthropic brand to this landing page"
→ Set `background: #faf9f5`, headings use `font-family: 'Poppins', Arial, sans-serif; color: #141413`, body uses `font-family: 'Lora', Georgia, serif`, CTAs use `background: #d97757; color: #faf9f5`.

**Example 3: Formatting a Word doc**
User says: "Brand this report with Anthropic styling"
→ Title page with `#141413` background, white Poppins title. Body pages use `#faf9f5` page color, Lora body text in `#141413`, section headers in Poppins. Accent rules/borders in `#d97757`.

## Common Issues

- **Black boxes in slides**: If shapes render as solid black, you likely used `ShadingType.SOLID` instead of `ShadingType.CLEAR` in python-pptx. Always use CLEAR.
- **Fonts not rendering**: Poppins/Lora must be installed on the system. If the output shows Arial/Georgia everywhere, the custom fonts aren't available — the design still works, just with fallbacks.
- **Accent overuse**: A common mistake is applying orange to everything. Stick to the 60/30/10 rule: 60% neutral (Dark/Light), 30% secondary (Gray tones), 10% accent colors.
- **Low contrast**: Mid Gray (`#b0aea5`) on Light (`#faf9f5`) fails WCAG AA. Use Dark (`#141413`) for body text on light backgrounds.
