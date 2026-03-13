---
name: pptx
description: "Use this skill any time a .pptx file is involved in any way — as input, output, or both. This includes: creating slide decks, pitch decks, or presentations; reading, parsing, or extracting text from any .pptx file (even if the extracted content will be used elsewhere, like in an email or summary); editing, modifying, or updating existing presentations; combining or splitting slide files; working with templates, layouts, speaker notes, or comments. Trigger whenever the user mentions 'deck', 'slides', 'presentation', or references a .pptx filename, regardless of what they plan to do with the content afterward. If a .pptx file needs to be opened, created, or touched, use this skill. Do NOT use for Word documents (use docx), PDFs (use pdf), spreadsheets (use xlsx), or HTML/web artifacts (use web-artifacts-builder)."
license: Proprietary. LICENSE.txt has complete terms
---

# PPTX Skill

## Quick Reference

| Task | Guide |
|------|-------|
| Read/analyze content | `python -m markitdown presentation.pptx` |
| Edit or create from template | Read [editing.md](editing.md) |
| Create from scratch | Read [pptxgenjs.md](pptxgenjs.md) |

---

## Reading Content

```bash
# Text extraction
python -m markitdown presentation.pptx

# Visual overview
python scripts/thumbnail.py presentation.pptx

# Raw XML
python scripts/office/unpack.py presentation.pptx unpacked/
```

---

## Editing Workflow

**Read [editing.md](editing.md) for full details.**

1. Analyze template with `thumbnail.py`
2. Unpack → manipulate slides → edit content → clean → pack

---

## Creating from Scratch

**Read [pptxgenjs.md](pptxgenjs.md) for full details.**

Use when no template or reference presentation is available.

---

## Design Ideas

**Don't create boring slides.** Plain bullets on a white background won't impress anyone.

### Before Starting

- **Pick a bold, content-informed color palette**: The palette should feel designed for THIS topic.
- **Dominance over equality**: One color should dominate (60-70%), with 1-2 supporting tones and one sharp accent.
- **Dark/light contrast**: Dark backgrounds for title + conclusion, light for content. Or commit to dark throughout for a premium feel.
- **Commit to a visual motif**: Pick ONE distinctive element and repeat it across every slide.

### Color Palettes

Choose colors that match your topic — don't default to generic blue:

| Theme | Primary | Secondary | Accent |
|-------|---------|-----------|--------|
| **Midnight Executive** | `1E2761` (navy) | `CADCFC` (ice blue) | `FFFFFF` (white) |
| **Forest & Moss** | `2C5F2D` (forest) | `97BC62` (moss) | `F5F5F5` (cream) |
| **Coral Energy** | `F96167` (coral) | `F9E795` (gold) | `2F3C7E` (navy) |
| **Warm Terracotta** | `B85042` (terracotta) | `E7E8D1` (sand) | `A7BEAE` (sage) |
| **Ocean Gradient** | `065A82` (deep blue) | `1C7293` (teal) | `21295C` (midnight) |
| **Charcoal Minimal** | `36454F` (charcoal) | `F2F2F2` (off-white) | `212121` (black) |
| **Teal Trust** | `028090` (teal) | `00A896` (seafoam) | `02C39A` (mint) |
| **Berry & Cream** | `6D2E46` (berry) | `A26769` (dusty rose) | `ECE2D0` (cream) |
| **Sage Calm** | `84B59F` (sage) | `69A297` (eucalyptus) | `50808E` (slate) |
| **Cherry Bold** | `990011` (cherry) | `FCF6F5` (off-white) | `2F3C7E` (navy) |

### For Each Slide

**Every slide needs a visual element** — image, chart, icon, or shape.

**Layout options:** Two-column, icon + text rows, 2x2/2x3 grid, half-bleed image with overlay.

**Data display:** Large stat callouts (60-72pt), comparison columns, timeline/process flow.

### Typography

**Choose an interesting font pairing** — don't default to Arial.

| Header Font | Body Font |
|-------------|-----------|
| Georgia | Calibri |
| Arial Black | Arial |
| Cambria | Calibri |
| Trebuchet MS | Calibri |
| Palatino | Garamond |

| Element | Size |
|---------|------|
| Slide title | 36-44pt bold |
| Section header | 20-24pt bold |
| Body text | 14-16pt |
| Captions | 10-12pt muted |

### Spacing

- 0.5" minimum margins
- 0.3-0.5" between content blocks
- Leave breathing room

### Avoid (Common Mistakes)

- **Don't repeat the same layout** — vary across slides
- **Don't center body text** — left-align paragraphs; center only titles
- **Don't skimp on size contrast** — titles need 36pt+ vs 14-16pt body
- **Don't default to blue** — pick topic-specific colors
- **Don't mix spacing randomly** — choose 0.3" or 0.5" and use consistently
- **Don't create text-only slides** — add visual elements
- **Don't forget text box padding** — set `margin: 0` or offset shapes to account for padding
- **Don't use low-contrast elements** — icons AND text need strong contrast
- **NEVER use accent lines under titles** — hallmark of AI-generated slides

---

## QA (Required)

**Assume there are problems. Your job is to find them.**

### Content QA

```bash
python -m markitdown output.pptx
```

Check for missing content, typos, wrong order. Check for leftover placeholders:
```bash
python -m markitdown output.pptx | grep -iE "xxxx|lorem|ipsum|this.*(page|slide).*layout"
```

### Visual QA

**Use subagents** — even for 2-3 slides. You've been staring at the code and will see what you expect, not what's there.

Convert slides to images, then inspect for: overlapping elements, text overflow, low-contrast text/icons, uneven gaps, insufficient margins, leftover placeholders.

### Verification Loop

1. Generate → Convert to images → Inspect
2. List issues found
3. Fix issues
4. Re-verify affected slides
5. Repeat until clean

**Do not declare success until at least one fix-and-verify cycle.**

---

## Converting to Images

```bash
python scripts/office/soffice.py --headless --convert-to pdf output.pptx
pdftoppm -jpeg -r 150 output.pdf slide
ls slide-*.jpg
```

**Use paths from `ls`.** Zero-padding varies: `slide-1.jpg` (<10 pages), `slide-01.jpg` (10-99), `slide-001.jpg` (100+).

Re-render specific slides:
```bash
pdftoppm -jpeg -r 150 -f N -l N output.pdf slide-fixed
```

---

## Examples

**Example 1: Pitch deck**
User says: "Create a 10-slide pitch deck for our Series A fundraise"
→ Read pptxgenjs.md. Pick a bold palette (not blue). Structure: Title → Problem → Solution → Market → Business Model → Traction → Team → Financials → Ask → Contact. Use large stat callouts for metrics, half-bleed images for team slide. QA every slide.

**Example 2: Extract content from slides**
User says: "Summarize what's in this presentation"
→ Run `python -m markitdown presentation.pptx` to extract text. Summarize key points from each slide.

**Example 3: Update existing deck**
User says: "Update the Q4 numbers in this quarterly review deck"
→ Read editing.md. Thumbnail the deck first, unpack, locate the data slides, update numbers in XML, pack. Visual QA the changed slides.

## Common Issues

- **Slides look AI-generated**: Remove accent lines under titles, avoid centered body text, vary layouts across slides, pick topic-specific colors instead of generic blue.
- **Text overflows**: Text boxes too narrow — widen them or reduce font size. Check after rendering, not just in code.
- **Low-contrast elements**: Especially icons on dark backgrounds. Add a contrasting circle behind dark icons or use lighter icon colors.
- **Leftover placeholder text**: Always run the grep check after template-based creation.
- **pptxgenjs not found**: Install with `npm install -g pptxgenjs`.

## Dependencies

- `pip install "markitdown[pptx]"` — text extraction
- `pip install Pillow` — thumbnail grids
- `npm install -g pptxgenjs` — creating from scratch
- LibreOffice (`soffice`) — PDF conversion (via `scripts/office/soffice.py`)
- Poppler (`pdftoppm`) — PDF to images
