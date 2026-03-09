# Skill Upgrade Summary

**Date:** March 8, 2026
**Reference:** [The Complete Guide to Building Skills for Claude](https://resources.anthropic.com/hubfs/The-Complete-Guide-to-Building-Skill-for-Claude.pdf) (Anthropic)
**Approach:** Full overhaul — all 14 skills upgraded in 4 tiers

---

## What Changed (Applied Consistently)

Every skill received these upgrades based on the Anthropic guide's best practices:

1. **Description formula**: WHAT it does + WHEN to use (trigger phrases users would say) + DO NOT use for (negative triggers with cross-references to correct skill)
2. **Examples section**: 2-3 concrete "User says X → Do Y" scenarios
3. **Common Issues section**: 3-6 troubleshooting entries for frequent pitfalls
4. **Trimming**: Verbose or redundant content condensed; moved toward the ~500-line target where applicable
5. **Preserved**: All core workflows, code samples, reference file paths, and functional content kept intact

---

## Line Count Comparison

| Skill | Original | Upgraded | Delta | Notes |
|-------|----------|----------|-------|-------|
| brand-guidelines | 73 | 59 | -14 | Trimmed, added triggers + examples |
| schedule | 40 | 68 | +28 | Added triggers, examples, common issues |
| internal-comms | 32 | 47 | +15 | Added triggers, examples, common issues |
| theme-factory | 59 | 64 | +5 | Added triggers + negative triggers |
| algorithmic-art | 404 | 142 | -262 | Major trim: verbose philosophy condensed |
| canvas-design | 129 | 93 | -36 | Trimmed, added triggers + examples |
| mcp-builder | 236 | 114 | -122 | Trimmed, added triggers + examples |
| slack-gif-creator | 254 | 129 | -125 | Trimmed, added triggers + examples |
| doc-coauthoring | 375 | 184 | -191 | Major trim: condensed workflow steps |
| skill-creator | 485 | 301 | -184 | Near 500-line limit → trimmed substantially |
| web-artifacts-builder | 73 | 90 | +17 | Added examples + common issues |
| docx | 590 | 554 | -36 | Added examples + issues, minor trim |
| xlsx | 291 | 203 | -88 | Added examples + issues, trimmed |
| pptx | 234 | 204 | -30 | Added examples + issues, slight trim |
| pdf | 314 | 256 | -58 | Added examples + issues, trimmed |

**Total:** 3,589 → 2,508 lines (-30% overall, while adding new sections to every skill)

---

## Tier Breakdown

### Tier 1 — Worst Gaps (minimal or no descriptions)
- **brand-guidelines**: Had no trigger phrases, no negative triggers, no examples. Now has all three.
- **schedule**: Had a one-line description. Now has trigger phrases ("remind me", "run this every"), negative triggers, examples, and common issues.
- **internal-comms**: Had a generic description. Now has specific trigger phrases ("status update", "3P update", "incident report") and negative triggers for external comms.
- **theme-factory**: Had a brief description. Now has trigger phrases ("theme this", "change the colors") and negative triggers separating it from brand-guidelines.

### Tier 2 — Moderate Gaps (had content but missing structure)
- **algorithmic-art**: Was 404 lines with verbose philosophy sections. Trimmed to 142 while preserving all technical content. Added negative triggers distinguishing it from canvas-design and data-visualization.
- **canvas-design**: Added trigger phrases ("make a poster", "create art"), negative triggers, examples, and common issues. Trimmed from 129 to 93.
- **mcp-builder**: Added trigger phrases ("build an MCP server", "FastMCP"), negative triggers (vs. skill-creator, vs. regular APIs), examples, common issues. Trimmed from 236 to 114.
- **slack-gif-creator**: Added trigger phrases ("make a GIF", "Slack emoji"), negative triggers, examples, common issues. Trimmed from 254 to 129.

### Tier 3 — Polish (decent descriptions, missing examples/issues)
- **doc-coauthoring**: Added negative triggers ("Do NOT use for quick one-off text, slide decks"), 3 examples, 5 common issues. Condensed 3-stage workflow from 375 to 184 lines.
- **skill-creator**: Added trigger phrases ("create a skill", "benchmark this skill"), negative triggers, 3 examples, 5 common issues, reference files table. Trimmed from 485 to 301.
- **web-artifacts-builder**: Added trigger phrases ("build a complex artifact", "I need shadcn components"), negative triggers, 3 examples, 5 common issues.

### Tier 4 — Fine-tune (already strong, minor enhancements)
- **docx**: Added cross-references to other skills in negative triggers, 3 examples, 6 common issues. Minor trim.
- **xlsx**: Added cross-references in negative triggers, 3 examples, 5 common issues. Trimmed from 291 to 203.
- **pptx**: Added negative triggers with cross-references, 3 examples, 5 common issues.
- **pdf**: Enhanced description with explicit trigger phrases, added cross-references, 3 examples, 6 common issues.

---

## How to Install

The `.skills/` directory is read-only in Cowork sessions. To apply these upgrades:

1. Copy each upgraded `SKILL.md` from `skill-upgrades/<name>/SKILL.md` to replace the corresponding file in your `.skills/skills/<name>/SKILL.md`
2. Or copy the entire `skill-upgrades/` folder contents into `.skills/skills/` on your local machine

All upgrades are drop-in replacements — no other files in the skill directories were modified.
