---
name: skill-creator
description: "Create new skills, modify and improve existing skills, and measure skill performance. Use when the user says: 'create a skill', 'make a skill', 'build a skill', 'turn this into a skill', 'improve this skill', 'optimize this skill', 'run evals on this skill', 'benchmark this skill', 'test this skill', 'skill description', or wants to capture a workflow as a reusable skill. Also trigger when a user wants to package a repeatable Claude workflow, optimize triggering accuracy, or run A/B comparisons between skill versions. Do NOT use for creating MCP servers (use mcp-builder), writing documentation (use doc-coauthoring), or building web artifacts (use web-artifacts-builder)."
---

# Skill Creator

A skill for creating new skills and iteratively improving them.

## High-Level Process

1. Decide what the skill should do and roughly how
2. Write a draft of the skill
3. Create test prompts and run Claude-with-access-to-the-skill on them
4. Evaluate results both qualitatively and quantitatively
   - While runs happen in the background, draft quantitative evals if there aren't any
   - Use `eval-viewer/generate_review.py` to show the user results
5. Rewrite the skill based on feedback
6. Repeat until satisfied
7. Expand the test set and try at larger scale

Your job is to figure out where the user is in this process and help them progress. Maybe they want to make a skill from scratch, or maybe they already have a draft and need the eval/iterate loop. Be flexible — if the user says "I don't need evaluations, just vibe with me", do that instead.

After the skill is done, you can also run the description optimizer to improve triggering accuracy.

## Communicating with the User

Pay attention to context cues about the user's technical familiarity. Terms like "evaluation" and "benchmark" are borderline but OK. For "JSON" and "assertion", see cues from the user before using them without explanation. Briefly explain terms if in doubt.

---

## Creating a Skill

### Capture Intent

Start by understanding the user's intent. The current conversation might already contain a workflow to capture (e.g., "turn this into a skill"). If so, extract answers from conversation history first — tools used, sequence of steps, corrections made, input/output formats observed. The user may need to fill gaps and should confirm before proceeding.

1. What should this skill enable Claude to do?
2. When should it trigger? (what user phrases/contexts)
3. What's the expected output format?
4. Should we set up test cases? Skills with objectively verifiable outputs (file transforms, data extraction, code generation) benefit from test cases. Skills with subjective outputs (writing style, art) often don't. Suggest the appropriate default, but let the user decide.

### Interview and Research

Proactively ask about edge cases, input/output formats, example files, success criteria, and dependencies. Wait to write test prompts until this is ironed out.

Check available MCPs — if useful for research (searching docs, finding similar skills), research in parallel via subagents if available, otherwise inline.

### Write the SKILL.md

Based on the interview, fill in:

- **name**: Skill identifier
- **description**: When to trigger, what it does. This is the primary triggering mechanism — include both what the skill does AND specific contexts for when to use it. Make descriptions a bit "pushy" to combat undertriggering. For example, instead of "How to build a dashboard", write "How to build a dashboard. Use this skill whenever the user mentions dashboards, data visualization, or wants to display any kind of data, even if they don't explicitly ask for a 'dashboard.'"
- **compatibility**: Required tools, dependencies (optional, rarely needed)
- **the skill body**

### Skill Writing Guide

#### Anatomy of a Skill

```
skill-name/
├── SKILL.md (required)
│   ├── YAML frontmatter (name, description required)
│   └── Markdown instructions
└── Bundled Resources (optional)
    ├── scripts/    - Executable code for deterministic/repetitive tasks
    ├── references/ - Docs loaded into context as needed
    └── assets/     - Files used in output (templates, icons, fonts)
```

#### Progressive Disclosure

Skills use a three-level loading system:
1. **Metadata** (name + description) — Always in context (~100 words)
2. **SKILL.md body** — In context whenever skill triggers (<500 lines ideal)
3. **Bundled resources** — As needed (unlimited, scripts can execute without loading)

Keep SKILL.md under 500 lines; if approaching the limit, add hierarchy with clear pointers for follow-up. Reference files clearly with guidance on when to read them. For large reference files (>300 lines), include a table of contents.

**Domain organization**: When a skill supports multiple domains/frameworks:
```
cloud-deploy/
├── SKILL.md (workflow + selection)
└── references/
    ├── aws.md
    ├── gcp.md
    └── azure.md
```

#### Writing Patterns

Use imperative form. Include examples:
```markdown
## Commit message format
**Example 1:**
Input: Added user authentication with JWT tokens
Output: feat(auth): implement JWT-based authentication
```

Explain the **why** behind instructions rather than heavy-handed MUSTs. Use theory of mind and make skills general, not narrow to specific examples. Write a draft, look at it with fresh eyes, then improve.

### Test Cases

After writing the skill draft, come up with 2-3 realistic test prompts. Share them with the user for confirmation, then run them.

Save test cases to `evals/evals.json`:
```json
{
  "skill_name": "example-skill",
  "evals": [
    { "id": 1, "prompt": "User's task prompt", "expected_output": "Description of expected result", "files": [] }
  ]
}
```

See `references/schemas.md` for the full schema (including assertions).

## Running and Evaluating Test Cases

This section is one continuous sequence. Put results in `<skill-name>-workspace/`, organized by iteration (`iteration-1/`, `iteration-2/`, etc.) with each test case in its own directory (`eval-0/`, `eval-1/`, etc.).

### Step 1: Spawn All Runs (with-skill AND baseline) in the Same Turn

For each test case, spawn two subagents simultaneously — one with the skill, one without. Launch everything at once.

**With-skill run:**
```
Execute this task:
- Skill path: <path-to-skill>
- Task: <eval prompt>
- Input files: <eval files if any>
- Save outputs to: <workspace>/iteration-<N>/eval-<ID>/with_skill/outputs/
```

**Baseline run** depends on context:
- **New skill**: no skill at all (save to `without_skill/outputs/`)
- **Improving existing**: snapshot the old version, point baseline at snapshot (save to `old_skill/outputs/`)

Write `eval_metadata.json` for each test case with a descriptive name.

### Step 2: Draft Assertions While Runs Are In Progress

Don't wait — draft quantitative assertions and explain them to the user. Good assertions are objectively verifiable with descriptive names. Subjective skills are better evaluated qualitatively.

Update `eval_metadata.json` and `evals/evals.json` with assertions.

### Step 3: Capture Timing Data

When subagents complete, save `total_tokens` and `duration_ms` to `timing.json` immediately — this data comes only through the task notification.

### Step 4: Grade, Aggregate, and Launch Viewer

1. **Grade** — spawn grader subagent reading `agents/grader.md`. Save to `grading.json` using fields `text`, `passed`, `evidence`. For programmatic assertions, write and run a script.

2. **Aggregate** —
   ```bash
   python -m scripts.aggregate_benchmark <workspace>/iteration-N --skill-name <name>
   ```

3. **Analyst pass** — read `agents/analyzer.md` for patterns: non-discriminating assertions, high-variance evals, time/token tradeoffs.

4. **Launch viewer** —
   ```bash
   nohup python <skill-creator-path>/eval-viewer/generate_review.py \
     <workspace>/iteration-N --skill-name "my-skill" \
     --benchmark <workspace>/iteration-N/benchmark.json > /dev/null 2>&1 &
   ```
   For iteration 2+, pass `--previous-workspace`. In headless environments, use `--static <output_path>`.

5. **Tell the user** to review the Outputs tab (qualitative) and Benchmark tab (quantitative).

### Step 5: Read Feedback

Read `feedback.json` when user is done. Empty feedback means it was fine. Focus improvements on test cases with specific complaints. Kill the viewer server.

---

## Improving the Skill

### How to Think About Improvements

1. **Generalize from feedback.** Skills will be used across many different prompts. If changes only fix the specific test cases, they're useless. Rather than fiddly overfitty changes, try different metaphors or patterns.

2. **Keep the prompt lean.** Remove things not pulling their weight. Read transcripts, not just outputs — if the skill wastes time on unproductive steps, remove those parts.

3. **Explain the why.** Today's LLMs are smart. If you find yourself writing ALWAYS or NEVER in all caps, reframe with reasoning instead. That's more humane and effective.

4. **Look for repeated work.** If all test case subagents independently wrote similar helper scripts, bundle that script in `scripts/`.

### The Iteration Loop

1. Apply improvements
2. Rerun all test cases into `iteration-<N+1>/`, including baselines
3. Launch reviewer with `--previous-workspace`
4. Wait for user review
5. Read feedback, improve again, repeat

Keep going until: user is happy, feedback is all empty, or no meaningful progress.

---

## Advanced: Blind Comparison

For rigorous comparison between two skill versions, read `agents/comparator.md` and `agents/analyzer.md`. An independent agent judges two outputs without knowing which is which. Optional, requires subagents.

---

## Description Optimization

After creating or improving a skill, offer to optimize the description for better triggering.

### Step 1: Generate Trigger Eval Queries

Create 20 eval queries — mix of should-trigger (8-10) and should-not-trigger (8-10). Queries must be realistic with concrete details (file paths, personal context, column names, casual speech, typos).

For **should-trigger**: different phrasings, uncommon use cases, cases competing with other skills.
For **should-not-trigger**: near-misses sharing keywords but needing something different. Avoid obviously irrelevant queries.

### Step 2: Review with User

Use `assets/eval_review.html` template. Replace placeholders, write to temp file, open for user review. User can edit, toggle, add/remove entries, then export.

### Step 3: Run Optimization Loop

```bash
python -m scripts.run_loop \
  --eval-set <path> --skill-path <path> \
  --model <model-id> --max-iterations 5 --verbose
```

This splits 60% train / 40% test, evaluates current description (3 runs each for reliability), proposes improvements via extended thinking, and iterates up to 5 times. Selects by test score to avoid overfitting.

### Step 4: Apply Result

Take `best_description` and update SKILL.md frontmatter. Show before/after and report scores.

---

### Package and Present (only if `present_files` tool is available)

```bash
python -m scripts.package_skill <path/to/skill-folder>
```

Direct the user to the resulting `.skill` file.

---

## Environment-Specific Notes

### Claude.ai
- No subagents: run test cases one at a time yourself, skip baselines
- No browser: present results in conversation, skip browser reviewer
- Skip quantitative benchmarking
- Description optimization (`run_loop.py`) requires `claude` CLI — skip if unavailable
- Packaging works anywhere with Python

### Cowork
- Subagents available — main workflow works (fall back to serial if timeouts)
- No display: use `--static <output_path>` for eval viewer, proffer a link
- ALWAYS generate the eval viewer BEFORE evaluating yourself — get results in front of the human ASAP
- Feedback downloads as `feedback.json` file
- Description optimization should work via `claude -p` subprocess

### Updating Existing Skills
- Preserve the original name and `name` frontmatter field
- Copy to writeable location before editing (installed skill may be read-only)
- If packaging manually, stage in `/tmp/` first

## Reference Files

| Resource | When to load | Path |
|----------|-------------|------|
| Grader agent | Step 4 (grading) | `agents/grader.md` |
| Comparator agent | Blind comparison | `agents/comparator.md` |
| Analyzer agent | Benchmark analysis | `agents/analyzer.md` |
| JSON schemas | Evals, grading, benchmark | `references/schemas.md` |

## Examples

**Example 1: New skill from scratch**
User says: "I want to create a skill that generates changelog entries from git commits"
→ Capture intent: what format? conventional commits? grouping? Include test prompts with real git log output. Draft skill, run 2-3 test cases, iterate based on feedback.

**Example 2: Improving an existing skill**
User says: "This docx skill keeps making ugly tables, can we fix it?"
→ Skip to eval/iterate loop. Snapshot current skill, create test cases focused on table formatting, run with-skill vs old-skill comparisons, identify patterns, refine instructions.

**Example 3: Turn conversation into skill**
User says: "We just figured out a great workflow for code review — turn this into a skill"
→ Extract the workflow from conversation history: tools used, sequence, corrections. Draft skill capturing the pattern, confirm with user, then test.

## Common Issues

- **Eval viewer not generated**: This is the most common mistake. ALWAYS run `generate_review.py` before trying to evaluate or improve the skill yourself. The human needs to see results first.
- **Overfitting to test cases**: If improvements only work for the specific test prompts, they're too narrow. Generalize by explaining the "why" rather than adding rigid rules.
- **Skill too long**: Keep SKILL.md under 500 lines. Move detailed reference material to `references/` directory with clear pointers.
- **Description undertriggering**: Make descriptions slightly "pushy" — include specific trigger phrases and contexts. Use the description optimizer for systematic improvement.
- **Subagent timeouts**: In Cowork, fall back to running test cases in series rather than parallel.
