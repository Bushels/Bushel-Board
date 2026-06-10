export const PUBLIC_PARKED_GRAIN_LABELS = [
  "Spring Wheat",
  "Winter Wheat",
  "Peas",
  "Lentils",
  "Flaxseed",
  "Rye",
  "Mustard Seed",
  "Canaryseed",
  "Chick Peas",
  "Sunflower",
] as const;

export const PUBLIC_ADVICE_FORBIDDEN_TERMS = [
  "trade signal",
  "pricing plan",
  "pricing recommendation",
  "pricing call",
  "pricing advice",
  "trading advice",
  "hedging advice",
  "trade recommendation",
  "market recommendation",
  "buy signal",
  "sell signal",
  "price advice",
  "price-advice",
  "financial advice",
  "buy",
  "sell",
] as const;

export const PUBLIC_ADVICE_SANITIZE_TERMS = [
  ...PUBLIC_ADVICE_FORBIDDEN_TERMS,
  "trade",
] as const;

export const X_SIGNAL_ADVICE_FORBIDDEN_TERMS = [
  ...PUBLIC_ADVICE_SANITIZE_TERMS,
  "short",
  "long",
  "trading",
  "price target",
] as const;

export const PUBLIC_BOARD_FORBIDDEN_TERMS = [
  ...PUBLIC_PARKED_GRAIN_LABELS,
  ...PUBLIC_ADVICE_FORBIDDEN_TERMS,
] as const;

export const PUBLIC_FORBIDDEN_TERM_PATTERN_FLAGS = "i";

export interface PublicForbiddenTermPatternSpec {
  term: string;
  source: string;
  flags: typeof PUBLIC_FORBIDDEN_TERM_PATTERN_FLAGS;
}

const PUBLIC_TERM_WORD_SEPARATOR_PATTERN = "[\\s\\-/]+";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapedTermPatternSource(term: string): string {
  return term.trim().split(/\s+/).map(escapeRegExp).join(PUBLIC_TERM_WORD_SEPARATOR_PATTERN);
}

export function publicForbiddenTermPatternSource(term: string): string {
  return `\\b${escapedTermPatternSource(term)}\\b`;
}

export function publicForbiddenTermPatternSpec(term: string): PublicForbiddenTermPatternSpec {
  return {
    term,
    source: publicForbiddenTermPatternSource(term),
    flags: PUBLIC_FORBIDDEN_TERM_PATTERN_FLAGS,
  };
}

export function publicForbiddenTermPatternSpecs(
  terms: readonly string[],
): PublicForbiddenTermPatternSpec[] {
  return terms.map(publicForbiddenTermPatternSpec);
}

export function publicForbiddenTermRegex(term: string): RegExp {
  return new RegExp(publicForbiddenTermPatternSource(term), PUBLIC_FORBIDDEN_TERM_PATTERN_FLAGS);
}

export function findPublicForbiddenTerms(value: string, terms: readonly string[]): string[] {
  return terms.filter((term) => publicForbiddenTermRegex(term).test(value));
}

function termsPattern(terms: readonly string[], flags: string): RegExp {
  const orderedTerms = [...terms].sort((left, right) => right.length - left.length);
  return new RegExp(`\\b(${orderedTerms.map(escapedTermPatternSource).join("|")})\\b`, flags);
}

const PUBLIC_ADVICE_SANITIZE_PATTERN = termsPattern(PUBLIC_ADVICE_SANITIZE_TERMS, "gi");
const X_SIGNAL_ADVICE_PATTERN = termsPattern(X_SIGNAL_ADVICE_FORBIDDEN_TERMS, "i");

export function sanitizePublicAdviceCopy(value: string, replacement = "watch term"): string {
  return value.replace(PUBLIC_ADVICE_SANITIZE_PATTERN, replacement);
}

export function sanitizePublicXSignalCopy(value: string, fallback = "X Pulse watch evidence"): string {
  const sanitized = sanitizePublicAdviceCopy(value).replace(/\s+/g, " ").trim();
  return sanitized || fallback;
}

export function containsXSignalAdviceLanguage(value: string): boolean {
  return X_SIGNAL_ADVICE_PATTERN.test(value);
}

export function publicWheatGapLabels(gaps: readonly string[]): string[] {
  const labels = gaps.map((gap) => {
    if (/spring wheat|winter wheat/i.test(gap)) return "class-specific Wheat mapping";
    return gap;
  });

  return labels.filter((label, index) => labels.indexOf(label) === index);
}

export function sanitizePublicWheatClassCopy(value: string): string {
  return value
    .replace(/Spring\/Winter class mapping/gi, "class-specific Wheat mapping")
    .replace(/Spring\/Winter Wheat/gi, "class-specific Wheat")
    .replace(/Spring Wheat|Winter Wheat/gi, "class-specific Wheat");
}
