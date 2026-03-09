---
name: internal-comms
description: "Write internal communications using company-standard formats and templates. Use when the user says: 'write a status update', 'draft a 3P update', 'create a newsletter', 'write an FAQ', 'draft an incident report', 'leadership update', 'project update', 'team update', 'weekly update', 'company comms', or any request to write internal-facing organizational communications. Also trigger for 'write an announcement', 'draft a memo to the team', or 'prepare talking points'. Do NOT use for external communications (press releases, customer emails, marketing copy), personal emails, or blog posts intended for public audiences."
license: Complete terms in LICENSE.txt
---

# Internal Communications

Write polished internal comms using company-preferred formats. Each communication type has a dedicated template with specific formatting, tone, and content-gathering instructions.

## Workflow

1. **Identify the communication type** from the user's request
2. **Load the matching template** from the `examples/` directory (see table below)
3. **Follow the template's instructions** for formatting, tone, and required sections
4. **Gather missing context** — ask the user for details the template requires but the conversation doesn't provide

## Communication Types

| Type | Template file | Trigger phrases |
|------|--------------|-----------------|
| 3P Update (Progress/Plans/Problems) | `examples/3p-updates.md` | "3P update", "progress update", "team status" |
| Company Newsletter | `examples/company-newsletter.md` | "newsletter", "company update", "all-hands summary" |
| FAQ Responses | `examples/faq-answers.md` | "FAQ", "common questions", "Q&A" |
| General / Other | `examples/general-comms.md` | "announcement", "memo", "incident report", "leadership update" |

If the request doesn't clearly match a template, load `examples/general-comms.md` as the starting point and adapt.

## Examples

**Example 1: Weekly team update**
User says: "Write my 3P update for this week"
→ Load `examples/3p-updates.md`. Ask the user for their progress items, upcoming plans, and any blockers. Format using the 3P template structure.

**Example 2: Company newsletter**
User says: "Draft this month's company newsletter"
→ Load `examples/company-newsletter.md`. Ask what highlights, milestones, and announcements to include. Follow the newsletter template for sections and tone.

**Example 3: Incident report**
User says: "Write up the outage from yesterday"
→ Load `examples/general-comms.md`. Gather timeline, root cause, impact, and resolution details. Format as a structured incident report.

## Common Issues

- **Too formal or too casual**: Each template specifies a tone. Follow it — 3P updates are concise and direct, newsletters are warmer and celebratory, incident reports are factual and neutral.
- **Missing context**: Don't fabricate details. If the user hasn't provided enough info for a required section, ask specifically: "What were the key blockers this week?" rather than guessing.
- **Wrong template**: If the output doesn't feel right for the audience, double-check which template you loaded. A leadership update and a team update have different depths and framing.
