---
name: agent-auditor
description: >
  Audit how an agent prompt, role definition, or orchestration policy performed after a real task,
  compare the actual run to the target agent file, score the run, propose improvements, and define
  replay slices before promotion.
  Use when the user says: 'audit this agent', 'why did this agent struggle', 'score this agent',
  'postmortem this agent', 'improve this agent after use', or asks to tighten an agent prompt,
  handoff rule, tool boundary, or workflow gate after a real run.
  Do NOT use for: auditing a SKILL.md package (use skill-auditor), generic code review, or creating
  a brand-new skill from scratch (use skill-creator).
---

# Agent Auditor

Audit an existing agent after real usage. Focus on orchestration, context control, escalation judgment, and tool boundaries. Score the observed run, patch the candidate, and replay slices before promotion.

## Read These First

- `eval-core/framework.md`
- `eval-core/rubric.md`
- `eval-core/replay-policy.md`
- `eval-core/promotion-rules.md`
- `eval-core/report-template.md`

## Inputs To Gather

- target agent path
- the target agent prompt or config file
- original user request
- transcript or handoff trail
- tool trace
- output artifacts, diffs, or errors

## Workflow

### 1. Reconstruct the agent contract

Extract the agent's expected behavior from:

- role definition
- workflow gates
- tool permissions
- escalation rules
- stop conditions
- handoff or review responsibilities

### 2. Score the observed run

Use the agent rubric from `eval-core/rubric.md`.

If you want a deterministic total, run:

```bash
python eval-core/scripts/score_audit.py --mode agent --evidence-level observed --scores-json '{"task_success":4,"instruction_compliance":4,"orchestration_quality":3,"context_management":3,"escalation_judgment":4,"safety":5,"efficiency":3}' --pretty
```

### 3. Patch one control surface at a time

Prefer smaller agent changes over large rewrites:

- tighten role boundaries
- improve workflow order
- add or sharpen stop conditions
- narrow tool freedom
- clarify escalation rules
- remove overlapping responsibilities

### 4. Replay before re-scoring

Use frozen slices for long tasks:

1. the failed slice
2. one neighboring case
3. one canary case

Replay the whole task only when the patch changes broad orchestration or safety behavior.

### 5. Decide promotion status

Use the disposition rules in `eval-core/promotion-rules.md`.

If replay has not happened yet, keep the candidate on the branch and mark the result `hold`.

## Required Deliverables

- observed score report
- patch summary
- replay plan
- replayed score report
- promotion recommendation

## Common Agent Failure Patterns

| Pattern | Typical fix |
|--------|-------------|
| Too much role overlap | Narrow the role and handoff rules |
| Weak verification gate | Make the gate mandatory and explicit |
| Tool thrash | Constrain tool order or decision points |
| Context sprawl | Reduce what must stay in active context |
| Bad escalation timing | Add a stop rule for uncertainty or risk |
