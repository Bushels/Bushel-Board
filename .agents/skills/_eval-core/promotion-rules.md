# Promotion Rules

## Promote

Promote only when:

- observed score is mostly 4-5,
- safety is 5,
- replay passed the failed and canary slices,
- the patch reduced ambiguity without expanding scope.

## Hold

Hold when:

- replay was not run,
- evidence is partial,
- the patch is correct but broad,
- the change needs one more real task before default use.

## Archive

Archive or mark retired when:

- the tool overlaps an active, better tool,
- it points to removed files or dead runtime paths,
- it can trigger a tombstoned pipeline,
- its safest use is historical reference only.

## No Change

Use no change when the tool followed its contract and the lesson belongs in project docs, not in the tool prompt.
