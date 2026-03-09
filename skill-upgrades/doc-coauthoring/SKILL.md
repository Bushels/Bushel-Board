---
name: doc-coauthoring
description: "Guide users through a structured workflow for co-authoring documentation. Use when the user says: 'write a doc', 'draft a proposal', 'create a spec', 'write up', 'help me write', 'co-author', 'document this', or mentions specific doc types like 'PRD', 'design doc', 'decision doc', 'RFC', 'technical spec', 'one-pager', 'brief'. Also trigger when the user seems to be starting a substantial writing task that would benefit from structured context gathering. Do NOT use for quick one-off text (emails, Slack messages — use internal-comms), slide decks (use pptx), spreadsheet-based deliverables (use xlsx), or creative writing like blog posts or marketing copy."
---

# Doc Co-Authoring Workflow

A structured workflow for collaborative document creation through three stages: Context Gathering, Refinement & Structure, and Reader Testing.

## When to Offer This Workflow

**Trigger conditions:**
- User mentions writing documentation: "write a doc", "draft a proposal", "create a spec", "write up"
- User mentions specific doc types: "PRD", "design doc", "decision doc", "RFC"
- User seems to be starting a substantial writing task

**Initial offer:**
Offer the structured workflow, explaining the three stages:

1. **Context Gathering**: User provides all relevant context while Claude asks clarifying questions
2. **Refinement & Structure**: Iteratively build each section through brainstorming and editing
3. **Reader Testing**: Test the doc with a fresh Claude (no context) to catch blind spots

Ask if they want this workflow or prefer freeform. If declined, work freeform. If accepted, proceed to Stage 1.

## Stage 1: Context Gathering

**Goal:** Close the gap between what the user knows and what Claude knows.

### Initial Questions

Ask for meta-context:

1. What type of document is this? (e.g., technical spec, decision doc, proposal)
2. Who's the primary audience?
3. What's the desired impact when someone reads this?
4. Is there a template or specific format to follow?
5. Any other constraints or context to know?

Inform them they can answer in shorthand or dump information however works best.

**If user provides a template or mentions a doc type:**
- Ask if they have a template document to share
- If they provide a link, use the appropriate integration to fetch it
- If they provide a file, read it

**If user mentions editing an existing shared document:**
- Use the appropriate integration to read the current state
- Check for images without alt-text — explain that Claude won't be able to see them when others use Claude to understand the doc. Offer to generate alt-text if they paste images into chat.

### Info Dumping

Encourage the user to dump all context: background, related discussions, why alternatives aren't being used, organizational context, timeline pressures, technical architecture, stakeholder concerns.

Advise them not to worry about organizing it. Offer multiple input methods:
- Stream-of-consciousness info dump
- Point to team channels or threads to read
- Link to shared documents

**If integrations are available** (Slack, Teams, Google Drive, SharePoint, or other MCP servers), mention these can pull context directly.

**If no integrations are detected:** Suggest enabling connectors in Claude settings, or pasting relevant content directly.

**During context gathering:**
- If user mentions channels/documents and integrations are available: read them now
- If user mentions unknown entities/projects: ask if connected tools should be searched
- Track what's being learned and what's still unclear

**Asking clarifying questions:**
When user signals they've done their initial dump, generate 5-10 numbered questions based on gaps. Inform them they can use shorthand to answer.

**Exit condition:** Sufficient context when you can ask about edge cases and trade-offs without needing basics explained.

**Transition:** Ask if there's more context or if it's time to move to drafting.

## Stage 2: Refinement & Structure

**Goal:** Build the document section by section through brainstorming, curation, and iterative refinement.

Explain the per-section process:
1. Clarifying questions about what to include
2. Brainstorm 5-20 options
3. User indicates what to keep/remove/combine
4. Draft the section
5. Refine through surgical edits

Start with the section that has the most unknowns (usually the core decision/proposal).

**Section ordering:** If structure is clear, ask which section to start first. Suggest starting with the most uncertain section. If user doesn't know sections needed, suggest 3-5 appropriate ones based on doc type.

**Once structure is agreed:** Create initial structure with placeholder text.
- **If artifacts available:** Use `create_file` for the scaffold
- **If no artifacts:** Create a markdown file (e.g., `decision-doc.md`, `technical-spec.md`)

**For each section:**

### Step 1: Clarifying Questions
Generate 5-10 specific questions based on context and section purpose.

### Step 2: Brainstorming
Brainstorm 5-20 things that might be included, looking for forgotten context and unconsidered angles.

### Step 3: Curation
Ask which points to keep/remove/combine. Accept both numbered selections and freeform feedback.

### Step 4: Gap Check
Ask if anything important is missing.

### Step 5: Drafting
Use `str_replace` to replace placeholder text with drafted content. After drafting, provide a link/confirm completion. Ask them to indicate changes rather than editing directly (helps learn their style).

### Step 6: Iterative Refinement
- Use `str_replace` for all edits (never reprint the whole doc)
- If using artifacts: provide link after each edit
- If user edits directly: note their changes for future sections
- After 3 consecutive iterations with no substantial changes, ask if anything can be removed

**Near Completion (80%+ sections done):** Re-read entire document checking for flow, redundancy, contradictions, and filler. When all sections are drafted, do a final coherence review.

## Stage 3: Reader Testing

**Goal:** Test the document with a fresh Claude (no context bleed) to verify it works for readers.

### With Sub-Agents Available (e.g., Claude Code, Cowork)

1. **Predict Reader Questions** — Generate 5-10 realistic questions readers would ask
2. **Test with Sub-Agent** — For each question, invoke a sub-agent with just the document and the question. Summarize what Reader Claude got right/wrong.
3. **Additional Checks** — Invoke sub-agent to check for ambiguity, false assumptions, contradictions
4. **Report and Fix** — If issues found, loop back to refinement for problematic sections

### Without Sub-Agents (e.g., claude.ai web)

1. **Predict Reader Questions** — Generate 5-10 realistic questions
2. **Setup Testing** — Instruct user to open a fresh Claude conversation, paste the document, and ask the questions
3. **Additional Checks** — Have Reader Claude check for ambiguity, assumed knowledge, contradictions
4. **Iterate** — Fix gaps based on what Reader Claude struggled with

**Exit Condition:** Reader Claude consistently answers questions correctly and doesn't surface new gaps.

## Final Review

When Reader Testing passes:
1. Recommend a final read-through — they own this document
2. Suggest double-checking facts, links, and technical details
3. Ask them to verify it achieves the desired impact

**Final tips:**
- Consider linking this conversation in an appendix
- Use appendices for depth without bloating the main doc
- Update the doc as feedback is received from real readers

## Tips for Effective Guidance

**Tone:** Direct and procedural. Explain rationale briefly when it affects user behavior.

**Handling Deviations:** If user wants to skip a stage, let them. If frustrated, suggest ways to move faster. Always give user agency.

**Context Management:** Proactively ask about gaps as they come up.

**Artifact Management:** Use `create_file` for sections, `str_replace` for edits, link after every change. Never use artifacts for brainstorming lists.

**Quality over Speed:** Don't rush. Each iteration should make meaningful improvements.

## Examples

**Example 1: Technical spec**
User says: "I need to write a design doc for our new auth system"
→ Trigger Stage 1: ask about audience (engineering team? leadership?), existing auth, migration constraints. Brainstorm sections: Problem Statement, Technical Approach, Migration Plan, Security Model, Alternatives Considered. Build iteratively.

**Example 2: Decision doc**
User says: "Help me write up why we should switch from AWS to GCP"
→ Trigger Stage 1: gather context on current AWS usage, pain points, GCP evaluation. Suggest sections: Executive Summary, Current State, Evaluation Criteria, Recommendation, Cost Analysis. Start with Evaluation Criteria (most unknowns).

**Example 3: RFC/proposal**
User says: "I want to draft an RFC for changing our deployment process"
→ Trigger Stage 1: understand current process, pain points, proposed changes, stakeholders. Use RFC template if provided. Focus refinement on the "Proposed Solution" section first.

## Common Issues

- **Context gathering takes too long**: If the user seems impatient, offer to skip to drafting and backfill context as gaps emerge during writing.
- **User wants to edit the doc directly**: That's fine — note their changes and learn their style preferences for future sections.
- **Reader Testing finds many issues**: This is normal. Focus on the most impactful gaps first rather than trying to fix everything at once.
- **User skips stages**: Respect their choice. The workflow is a guide, not a mandate. Jump to wherever they need help most.
- **No integrations available for context**: Suggest the user paste relevant Slack threads, documents, or discussions directly into the chat.
