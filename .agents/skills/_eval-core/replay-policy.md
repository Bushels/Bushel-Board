# Replay Policy

Replay is the proof step after patching an agent or skill.

## Replay Slices

Use three slices when practical:

1. `failed`: the exact slice that exposed the problem.
2. `neighbor`: a similar task that should benefit from the patch.
3. `canary`: a task that should not change behavior.

For documentation-only patches, a replay can be a static proof:

- all referenced files exist,
- example command runs,
- old broken wording no longer appears,
- expected trigger text still appears.

## Hold Rule

If replay is not run, mark the recommendation `hold`. Do not claim the patch is promoted from reasoning alone.

## No-Write Rule

Replay must preserve the same write boundary as the original task. A no-write skill or scout cannot be replayed by running a writer.
