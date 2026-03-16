# Jules Prompt Templates

Last updated: 2026-03-16

Use these templates for narrow Jules runs. The goal is to keep prompts specific enough that Jules cannot "solve" a small problem with a broad rewrite.

## Preflight Checklist

Before starting any Jules session:

1. Push the branch Jules should read.
2. Verify the current baseline with exact commands.
3. Name the exact files in scope.
4. Name the exact diagnostics or behaviors to change.
5. Add explicit stop conditions for unsafe shortcuts.

## Prompt: Lint-Only Fix

Use this when the repo already passes tests and build, and only lint errors remain.

```text
Fix only the verified ESLint errors in this repo. Do not address warnings.

Current verified baseline on YYYY-MM-DD:
- npm run test passes
- npm run build passes
- npx eslint . fails only on these errors:
  - <file path + rule>
  - <file path + rule>

Scope:
- <file 1>
- <file 2>

Goals:
1. Remove only the named ESLint errors.
2. Keep runtime behavior unchanged.
3. Do not edit files outside scope.

Validation:
- npx eslint <file 1> <file 2>
- npx eslint .
- npm run test
- npm run build

Rules:
- No large rewrites.
- Do not address warnings.
- Do not touch unrelated files.
- If the safe fix requires broader refactoring, stop and explain why.
- Show a plan before writing code.
```

## Prompt: Type-Only Fix With Data-Shape Guardrails

Use this when the error is a type mismatch near SQL, RPC, or shared helpers.

```text
Fix only the verified type errors in the named files. Keep runtime behavior unchanged.

Current verified baseline on YYYY-MM-DD:
- <baseline commands and results>

Scope:
- <file 1>
- <file 2>

Requirements:
- Read the source-of-truth row shape before changing types.
- If the code consumes SQL or RPC data, inspect the migration, RPC definition, or query helper that defines the returned columns.
- Before reusing a shared formatter or builder, verify the input data contains every required field.

Forbidden shortcuts:
- Do not use `as unknown as` on SQL or RPC rows to satisfy lint or TypeScript.
- Do not cast partial rows to richer domain types.
- Do not replace a local formatter with a shared formatter unless the input shape is proven compatible.

Validation:
- <targeted lint/type commands>
- npm run test
- npm run build

Rules:
- No large rewrites.
- If helper input shape does not match the available data, stop and explain the mismatch instead of guessing.
- Show a plan before writing code.
```

## Prompt: Query Or RPC Shape Fix

Use this when the bug is caused by misunderstanding what a query returns.

```text
Audit and fix only the data-shape mismatch in the named query path.

Scope:
- <consumer file>
- <query helper or RPC definition>
- <migration file if relevant>

Task:
1. Identify the exact returned row shape.
2. Identify what the consumer assumes the shape is.
3. Fix the mismatch with the smallest safe change.

Rules:
- Prefer explicit local types over broad casts.
- Prefer transforming from raw source rows with existing builders over inventing partial "fake" domain objects.
- Do not rewrite unrelated logic.

Validation:
- <targeted command>
- npm run test
- npm run build
```

## Plan Review Checklist

Approve a Jules plan only if:

- The file list matches the intended scope.
- The plan names the exact diagnostics or behaviors being changed.
- The validation commands are explicit.
- The plan does not drift into warnings, cleanup, or refactors outside scope.
- The plan explains where SQL or RPC row shapes come from if types are being changed.

Reject the plan if you see:

- `as unknown as` on database rows
- "Refactor" language for a small lint or type fix
- helper swaps without input-shape proof
- edits outside the named files
- missing validation commands

## Review Notes

- Passing lint, tests, and build is necessary but not sufficient.
- For data-heavy code, review semantic correctness too.
- "Semantic" means the code still means the right thing when it runs, not just that TypeScript and ESLint are satisfied.
