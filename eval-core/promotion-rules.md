# Promotion Rules

Use a human-gated promotion flow.

## Promotion Flow

1. Audit the original run.
2. Patch the candidate on a git branch.
3. Replay frozen slices.
4. Review the delta report.
5. Promote only if the gates pass.

## Dispositions

Use these dispositions consistently:

- `promote`: safe to merge or activate
- `hold`: promising, but needs more replay or benchmark coverage
- `redesign`: weak candidate, rethink the prompt or structure before more replay

## Thresholds

| Condition | Disposition |
|-----------|-------------|
| `replayed` evidence, weighted total `>= 85`, hard gates pass | `promote` |
| weighted total `70-84`, or evidence only `observed` | `hold` |
| weighted total `< 70`, or hard gates fail | `redesign` |
| evidence `forecast` only | `hold` |

## Patch Discipline

Change one control surface at a time when possible:

- description and triggers
- workflow steps
- tool access
- stop conditions
- escalation rules
- bundled resources

Small changes are easier to replay, easier to explain, and easier to trust.

## Audit Artifact Minimum

Before promotion, keep these artifacts together:

- observed score report
- patch summary
- replay score report
- short merge recommendation

If any of those are missing, do not promote.
