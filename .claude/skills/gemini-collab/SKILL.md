---
name: gemini-collab
description: >
  Collaborate with Gemini CLI MCP for strategic analysis, knowledge gap reviews, prompt engineering,
  and second-opinion audits on Bushel Board AI features.
  Use when the user says: 'ask Gemini', 'use Gemini', 'consult Gemini', 'get Gemini's opinion',
  'second opinion', 'cross-check with Gemini', 'Gemini review', 'brainstorm with Gemini',
  'what does Gemini think', 'strategic analysis', or when you need a fresh perspective on
  commodity knowledge, prompt quality, debate rules, or AI pipeline design.
  Also use proactively when: auditing commodity-knowledge.ts, reviewing AI prompt templates,
  designing new intelligence features, or evaluating market analysis quality.
  Do NOT use for: code editing (use standard tools), data queries (use grain-report skill),
  deployments (use supabase-deploy skill).
---

# Gemini Collaboration Skill — Bushel Board

Use Gemini CLI MCP as a strategic advisor for commodity AI features, knowledge base audits,
prompt engineering, and product strategy.

## Tool Selection

Gemini CLI exposes two main tools. One works reliably, one does not.

| Tool | Status | Use For |
|------|--------|---------|
| `ask-gemini` | **Reliable** | All queries — analysis, writing, file review, design |
| `brainstorm` | **Broken** | DO NOT USE — consistently returns placeholder responses |

Always use `ask-gemini`. Never use `brainstorm`.

## Prompt Patterns That Work

### Pattern 1: Single File + Focused Question (Best)

The `@file` syntax lets Gemini read codebase files directly. Single file + a direct question
produces the best results.

```
@path/to/file.ts What specific rules are missing from this that could cause incorrect output?
```

```
@path/to/file.ts List 5 topics that are missing but important for grain farmers.
```

```
@path/to/file.md Identify every analytical error in these rules. What should be added?
```

**Best question types with @file:**
- "What's missing from..." (gap analysis)
- "List N things that..." (enumeration)
- "Identify errors/flaws in..." (critique)
- "What could cause incorrect output?" (failure mode analysis)

### Pattern 2: Short Domain Question (Good)

Focused commodity/agriculture questions without file context. Keep under ~100 words.

```
What are the top 3 risks to Canadian canola prices in March 2026?
```

```
How should a farmer with 70% unsold wheat and narrowing basis approach delivery decisions?
```

### Pattern 3: Direct Writing/Design Requests (Good)

Ask Gemini to produce concrete output — system prompts, frameworks, rule sets.

```
Design a system prompt for an AI chat that helps grain farmers make delivery decisions.
Write the actual prompt text, not a description.
```

```
Write 5 debate rules for evaluating wheat export demand signals, in the style of our existing
agent-debate-rules.md.
```

### Pattern 4: Prototype Fidelity Check (CRITICAL for user-provided code)

When a user provides source code, HTML prototypes, or visual mockups, use Gemini to verify
your design preserves all structural elements before implementation.

```
Here is the user's prototype code (Chart.js):
[paste key dataset/config sections, not full HTML boilerplate]

Here is my Recharts design plan:
[paste the visual elements list from your design doc]

What structural elements from the prototype am I missing or simplifying away?
Focus on: axes, datasets, visual layers, interactions.
```

**Key rule:** Ask about STRUCTURE first, details (colors, labels) second. A missing axis
is 100x worse than a wrong color.

### Pattern 5: Design Doc Deviation Check

Before implementation, verify your design doc against the source material.

```
The user asked for: [1-sentence summary of what they showed/requested]
My design doc proposes: [1-sentence summary of what you designed]

List every element from the original that my design removes, changes, or adds.
Flag any that seem like unintentional simplifications.
```

## Prompt Patterns That FAIL

These consistently produce generic "I'm ready" placeholder responses. Avoid them.

| Pattern | Why It Fails | Fix |
|---------|-------------|-----|
| Long context dumps (>200 words of background) | Treated as conversation starter | Break into focused questions |
| Multiple `@file @file` references | Overloads context | Use one file at a time |
| "Score each section 1-10" | Evaluative/scoring requests | Ask "what's wrong with X" instead |
| Multi-part questions (A, B, C, D, E) | Too many asks at once | One question per call |
| Pasting full file contents in the prompt | Redundant with @file | Use @file syntax instead |
| Meta-process questions ("How should we improve our agents/workflow?") | Not a domain question; returns generic advice | Keep Gemini on domain/code tasks; handle process improvement internally |
| Asking for UX data display opinions without specifying constraints | Returns vague "both approaches work" | Provide specific options A/B with constraints for Gemini to evaluate |

## Model Selection

```
# Default: gemini-2.5-pro (deeper analysis, better for audits)
mcp__gemini-cli__ask-gemini(prompt: "...")

# Fast: gemini-2.5-flash (quicker, good for enumeration tasks)
mcp__gemini-cli__ask-gemini(prompt: "...", model: "gemini-2.5-flash")
```

Use **Pro** for: knowledge gap analysis, prompt engineering, strategic product questions.
Use **Flash** for: quick checks, listing/enumeration, validation tasks.

## Bushel Board-Specific Workflows

### Workflow 1: Knowledge Base Audit

Run when updating `commodity-knowledge.ts` or the RAG corpus.

```
Step 1: @supabase/functions/_shared/commodity-knowledge.ts
        What topics are missing that prairie grain farmers need for marketing decisions?

Step 2: @supabase/functions/_shared/commodity-knowledge.ts
        Are there any rules in the Basis Signal Matrix or Storage Decision Algorithm that
        could lead to incorrect advice under current market conditions?

Step 3: @supabase/functions/_shared/commodity-knowledge.ts
        Write 3 new framework sections that should be added, in the same style as the
        existing sections. Focus on [topic from Step 1 findings].
```

### Workflow 2: Prompt Quality Review

Run when modifying AI pipeline prompts.

```
Step 1: @supabase/functions/_shared/market-intelligence-config.ts
        What guardrails are missing from the CGC_DATA_GUARDRAILS section that could cause
        the AI to produce incorrect grain market analysis?

Step 2: @supabase/functions/generate-intelligence/prompt-template.ts
        Where could this prompt template allow the AI to produce misleading output?
        Focus on data misinterpretation risks.

Step 3: Write improved versions of the specific sections identified as weak.
```

### Workflow 3: Debate Rule Validation

Run when adding new debate rules to `agent-debate-rules.md`.

```
@docs/reference/agent-debate-rules.md
Given this scenario: [paste specific grain data scenario].
Which rules apply? Are any rules contradictory? What rule is missing to handle this case?
```

### Workflow 4: Feature Strategy

Run when designing new intelligence features or the chat feature.

```
We're building [feature]. The farmer needs to [goal]. We have access to [data sources].
What are the top 5 ways this feature should work differently from a generic chatbot?
Be specific to Canadian prairie grain farming.
```

### Workflow 5: Market Thesis Audit

Run to cross-check AI-generated market analysis quality.

```
Here is an AI-generated thesis for [Grain], Week [N]:
"[paste thesis]"

Here is the actual data:
- [paste key metrics]

Identify every analytical error. What should the corrected thesis say?
```

### Workflow 6: Prototype Fidelity Review

Run BEFORE writing a design doc when the user provides source code or a visual prototype.

```
Step 1: Inventory the prototype elements:
        "The user's Chart.js prototype has: [list every dataset, axis, visual layer,
        interaction]. I'm converting to Recharts. Which elements are hardest to reproduce
        faithfully and what Recharts components map to each?"

Step 2: After writing the design doc, run deviation check:
        "Original prototype has [N datasets on M axes]. My design has [X datasets on Y axes].
        What did I lose? Is the simplification justified?"

Step 3: After implementation, verify headline numbers:
        "The prototype shows -6.2% YoY and 293 Kt gap. Our implementation shows -4.4% YoY
        and 563 Kt. What could explain this difference — different data, different formula,
        or a bug?"
```

**Lesson learned (2026-03-15):** Delivery gap chart prototype had 3 datasets on 2 axes (including
a gap LINE on a right Y-axis). Design doc silently simplified to 2 lines on 1 axis with fill area.
All reviewer agents validated against the design doc, not the prototype. The gap line — the most
important element — was never built.

## Parallel Multi-Query Strategy

When you need multiple perspectives, make separate `ask-gemini` calls in the same turn.
Each call should be a single focused question. Do NOT combine them into one prompt.

```
# Good: Three parallel calls
Call 1: @commodity-knowledge.ts What basis analysis rules are missing?
Call 2: What weather data sources are free and useful for prairie grain farmers?
Call 3: @prompt-template.ts Where could this prompt produce hallucinated export numbers?
```

## When Gemini Adds Value vs When It Doesn't

**High value (use Gemini):**
- Domain-specific questions: commodity knowledge gaps, basis analysis rules, farming patterns
- File review: "What's wrong with this prompt?" / "What topics are missing?"
- Structural verification: "My design has X, the prototype has Y — what did I lose?"
- Writing concrete output: debate rules, system prompts, framework sections

**Low value (handle internally):**
- Meta-process questions: "How should we improve our agents?" → returns generic advice
- Workflow design: "What's the best CI/CD approach?" → not Gemini's domain
- Bug investigation: "Why did our chart render wrong?" → need codebase context, not LLM opinion
- UX opinions without constraints: "Should we use tabs or accordion?" → vague responses

**Lesson (2026-03-15):** During the delivery gap chart work, Gemini was consulted for meta-process
improvement ideas and returned unhelpful/placeholder responses. The MCP bridge works best for
domain-specific tasks where Gemini can reason about concrete code or agricultural concepts.

## Integrating Gemini Output

Gemini's responses are advisory input, not authoritative. Always:

1. **Cross-check claims** against the actual codebase before implementing
2. **Validate commodity knowledge** against CLAUDE.md data source hierarchy (CGC > AAFC > CFTC)
3. **Test suggested rules** against historical pipeline outputs before adding to debate rules
4. **Attribute insights** — when Gemini identifies a genuine gap, note it in the implementation

## Key Files Gemini Should Review

| File | What to ask about |
|------|------------------|
| `supabase/functions/_shared/commodity-knowledge.ts` | Knowledge gaps, incorrect rules, missing frameworks |
| `supabase/functions/_shared/market-intelligence-config.ts` | Prompt quality, guardrail completeness, persona tuning |
| `supabase/functions/generate-intelligence/prompt-template.ts` | Data misinterpretation risks, output format issues |
| `supabase/functions/analyze-market-data/index.ts` | Data pipeline completeness, missing data sources |
| `docs/reference/agent-debate-rules.md` | Rule gaps, contradictions, missing grain-specific rules |
| `supabase/functions/search-x-intelligence/search-queries.ts` | Query coverage, missing hashtags, seasonal gaps |
