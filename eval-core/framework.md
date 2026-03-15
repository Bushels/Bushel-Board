# Eval Core

Use one shared evaluation core for both skill audits and agent audits.

Keep the auditors separate at the adapter layer because skills and agents fail in different ways:

- A skill usually fails on trigger quality, instruction quality, or bundled resource quality.
- An agent usually fails on orchestration, context control, escalation judgment, or tool boundaries.

## Recommended Layout

```text
eval-core/
  framework.md
  rubric.md
  replay-policy.md
  promotion-rules.md
  report-template.md
  scripts/
    score_audit.py
    run_benchmarks.py
    audit_and_score.py

.agents/skills/
  skill-auditor/
    SKILL.md
  agent-auditor/
    SKILL.md

.claude/skills/
  skill-auditor/
    SKILL.md
  agent-auditor/
    SKILL.md

evals/
  skills/
    <skill-name>/
      <run-id>/
        observed.json
        patch-notes.md
        replay.json
  agents/
    <agent-name>/
      <run-id>/
        observed.json
        patch-notes.md
        replay.json
```

## Core Principles

1. Score the observed run first.
2. Propose improvements second.
3. Replay a frozen slice before claiming the improvement worked.
4. Promote only after replayed evidence clears the gates.

## Definitions

- Frozen slice: a saved subset of the original task inputs, artifacts, and expected outcome.
- Benchmark: a fixed set of repeatable test cases used to compare old vs new behavior.
- Canary: a very small regression test that should continue to pass after a change.
- Promotion: moving a candidate update into the live skill or agent definition.

## Simpler Control Plane

Prefer git branches over duplicate live and candidate folders.

- Live version: the version on the default branch.
- Candidate version: the patch on the current working branch.
- Audit artifacts: store under `evals/` if you want a durable paper trail.

This is simpler than maintaining `skill-name.candidate/` or `agent-name.candidate/` folders and reduces state drift.

## Starter Benchmark Pack

Use `evals/benchmarks/starter/` as the first fixed benchmark set (10 cases: 7 agent, 3 skill).

- List cases: `python eval-core/scripts/run_benchmarks.py list --pack starter`
- Scaffold a run: `python eval-core/scripts/run_benchmarks.py scaffold --pack starter --run-root evals/runs/<run-name>`
- Summarize a run: `python eval-core/scripts/run_benchmarks.py summarize --run-root evals/runs/<run-name>`

## One-Command Audit Pipeline

Use `audit_and_score.py` to chain scoring + scaffolding + report writing in one step:

```bash
# List available benchmark cases
python eval-core/scripts/audit_and_score.py --list

# Score an observed audit and populate evals/runs/<run>/observed.json
python eval-core/scripts/audit_and_score.py \
  --case agent-db-architect-missing-grant \
  --run-name wave4-review \
  --scores-json '{"task_success":4,"instruction_compliance":3,...}' \
  --findings "Agent omitted GRANT EXECUTE" \
  --proposed-changes "Add post-migration GRANT verification" \
  --summary "db-architect needs explicit GRANT checklist"

# After patching the agent, score the replay
python eval-core/scripts/audit_and_score.py \
  --case agent-db-architect-missing-grant \
  --run-name wave4-review \
  --evidence-level replayed \
  --scores-json '{"task_success":5,...}'

# Check overall run progress
python eval-core/scripts/run_benchmarks.py summarize --run-root evals/runs/wave4-review
```

The wrapper auto-scaffolds the run directory, copies `case.json`, computes weighted totals, grades, hard gates, and dispositions, then returns actionable next steps.
