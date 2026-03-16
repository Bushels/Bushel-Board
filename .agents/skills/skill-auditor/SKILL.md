---
name: skill-auditor
description: >
  Audit how a skill performed after a real task, compare the actual run to the target SKILL.md,
  score the run, propose improvements, and define replay slices before promotion.
  Use when the user says: 'audit this skill', 'benchmark this skill', 'why did this skill fail',
  'postmortem this skill', 'score this skill', 'improve this skill after use', or asks to tighten
  a SKILL.md after seeing its behavior on a real task.
  Do NOT use for: auditing agent prompt files or agent orchestration behavior (use agent-auditor),
  generic code review, or creating a brand-new skill from scratch (use skill-creator).
---

# Skill Auditor

Audit an existing skill after real usage. Score what actually happened, propose the minimum useful fix, and replay a frozen slice before recommending promotion.

## Read These First

- `eval-core/framework.md`
- `eval-core/rubric.md`
- `eval-core/replay-policy.md`
- `eval-core/promotion-rules.md`
- `eval-core/report-template.md`

## Inputs To Gather

- target skill path
- the target `SKILL.md`
- any bundled scripts, references, or assets that were actually used
- original user request
- transcript or tool trace
- output artifacts, diffs, or errors

## Workflow

### 1. Reconstruct the skill contract

Extract the skill's expected behavior from:

- frontmatter description and trigger language
- workflow steps
- negative triggers
- scripts, references, and assets the skill points to

### 2. Score the observed run

Use the skill rubric from `eval-core/rubric.md`.

If you want a deterministic total, run:

```bash
python eval-core/scripts/score_audit.py --mode skill --evidence-level observed --scores-json '{"task_success":4,"instruction_compliance":4,"trigger_quality":3,"resource_leverage":3,"tool_hygiene":4,"safety":5,"efficiency":3}' --pretty
```

### 3. Identify the smallest meaningful patch

Prefer changing one of these before doing anything larger:

- description trigger wording
- negative triggers
- workflow order
- visibility of important references
- bundled scripts or templates

### 4. Replay before re-scoring

Never claim the fix worked without replaying a frozen slice.

For long tasks, replay:

1. the failed slice
2. a near-neighbor slice
3. a canary slice that should still behave well

### 5. Decide promotion status

Use the disposition rules in `eval-core/promotion-rules.md`.

If the evidence is only hypothetical, label it `forecast` and hold the candidate.

## Required Deliverables

- observed score report
- patch summary
- replay plan
- replayed score report
- promotion recommendation

## Common Skill Failure Patterns

| Pattern | Typical fix |
|--------|-------------|
| Trigger is too broad | Tighten description and add negative triggers |
| Trigger is too narrow | Add real user phrasing to description |
| Important rule is buried | Move it earlier in the workflow |
| Reference is too deep to discover | Link it directly from `SKILL.md` |
| Skill adds noise, not leverage | Trim boilerplate and keep only reusable value |
