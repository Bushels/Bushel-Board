# Audit Eval Core Framework

Use this shared evaluator for agent and skill postmortems after a real task. The goal is not a large report; it is a small, repeatable quality gate that answers four questions:

1. What was the contract?
2. What actually happened?
3. What is the smallest useful patch?
4. What replay proves the patch did not make the tool worse?

## Evidence Levels

- `observed`: transcript, tool trace, diffs, command outputs, or artifacts exist.
- `partial`: some evidence exists, but important details are inferred.
- `forecast`: no replay happened yet; do not claim promotion.

## Default Outcome Labels

- `promote`: replay passed and the patch can become the new default.
- `hold`: patch is plausible but replay is incomplete or mixed.
- `archive`: tool is deprecated, overlapping, or unsafe to keep active.
- `no_change`: tool behaved correctly; document the lesson elsewhere.

## Minimum Report Shape

```text
Observed score:
Patch:
Replay plan:
Replay result:
Recommendation:
```
