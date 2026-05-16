import { z } from "zod";

export const ROUNDTABLE_ROLES = ["bull", "bear", "risk", "moderator"] as const;
export type RoundtableRole = (typeof ROUNDTABLE_ROLES)[number];

export const ROUND_CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;
export type RoundtableConfidence = (typeof ROUND_CONFIDENCE_LEVELS)[number];

const NonEmptyString = z.string().trim().min(1);

function normalizeSortedUnique(values: string[]): string[] {
  const deduped = Array.from(
    new Set(values.map((value) => value.trim()).filter((value) => value.length > 0)),
  );
  return deduped.sort((a, b) => a.localeCompare(b));
}

export const RoundtableRoleOutputSchema = z.object({
  role: z.enum(ROUNDTABLE_ROLES),
  signals: z.array(NonEmptyString).min(1),
  bull_claims: z.array(NonEmptyString),
  bear_claims: z.array(NonEmptyString),
  confidence: z.enum(ROUND_CONFIDENCE_LEVELS),
  evidence_refs: z.array(NonEmptyString).min(1),
  risk_flags: z.array(NonEmptyString),
});

export type RoundtableRoleOutput = z.infer<typeof RoundtableRoleOutputSchema>;

export function parseRoundtableRoleOutput(input: unknown): RoundtableRoleOutput {
  return RoundtableRoleOutputSchema.parse(input);
}

export function normalizeRoundtableRoleOutput(input: RoundtableRoleOutput): RoundtableRoleOutput {
  return {
    ...input,
    signals: normalizeSortedUnique(input.signals),
    bull_claims: normalizeSortedUnique(input.bull_claims),
    bear_claims: normalizeSortedUnique(input.bear_claims),
    evidence_refs: normalizeSortedUnique(input.evidence_refs),
    risk_flags: normalizeSortedUnique(input.risk_flags),
  };
}

export function parseAndNormalizeRoundtableRoleOutput(input: unknown): RoundtableRoleOutput {
  return normalizeRoundtableRoleOutput(parseRoundtableRoleOutput(input));
}
