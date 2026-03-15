# Replay Policy

Do not let an auditor claim improvement without replaying part of the task.

## Required Sequence

1. Score the original run as `observed`.
2. Propose or apply the candidate patch.
3. Replay a frozen slice.
4. Score the replay as `replayed`.
5. Compare old vs new before promotion.

## What To Replay

For long tasks, do not rerun everything by default. Replay three targeted slices:

1. Failed slice
   The specific portion that exposed the weakness.
2. Near-neighbor slice
   A similar case that checks whether the fix generalizes.
3. Canary slice
   A small success case that should not regress.

## When To Rerun The Whole Task

Replay the whole task only when the patch changes one of these:

- global routing logic
- broad orchestration policy
- safety policy
- tool permissions
- shared workflow gates used across many task types

## Replay Rules

- Keep the replay inputs frozen so comparison is fair.
- Do not leak the expected answer into the replay prompt.
- Do not overwrite the live skill or agent before replay passes.
- Label any no-replay score as `forecast`, not as a real post-fix result.

## Comparison Questions

After replay, answer these directly:

- Did the fix address the original failure?
- Did the fix improve the score on the failed slice?
- Did the near-neighbor case also improve or at least hold?
- Did the canary remain stable?

If the answer to any of those is "no", hold the candidate.
