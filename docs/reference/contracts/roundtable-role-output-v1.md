# Roundtable Role Output Contract v1

Purpose: deterministic JSON contract for each role in thesis roundtable generation.

## Required fields

- `role`: `"bull" | "bear" | "risk" | "moderator"`
- `signals`: non-empty array of concise market signal strings.
- `bull_claims`: array of bullish claim strings.
- `bear_claims`: array of bearish claim strings.
- `confidence`: `"low" | "medium" | "high"`
- `evidence_refs`: non-empty array of canonical evidence reference IDs.
- `risk_flags`: array of risk/warning labels.

## Invariants

1. `signals` and `evidence_refs` must be non-empty.
2. `bull_claims` and `bear_claims` can both be present for balanced role output.
3. `evidence_refs` values must be deduplicated and sorted for deterministic merge.
4. Empty strings are invalid for all list entries.

## Deterministic merge scaffolding

- Normalize claim and signal arrays with trim + dedupe + lexical sort.
- Normalize `evidence_refs` and `risk_flags` with trim + dedupe + lexical sort.
- Store normalized payload before downstream moderator merge so role-output hashes remain stable.
