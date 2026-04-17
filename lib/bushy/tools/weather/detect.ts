// WS4 Task 4.1 — Bushy chat harness
// Postal / ZIP country detector. Driven by format regex.
//
// Regex notes:
//   - CA_POSTAL: tripartite [A-Z]\d[A-Z] \d[A-Z]\d with optional whitespace
//     between halves. Case-insensitive — users often type lowercase.
//   - US_ZIP: 5 digits, optional ZIP+4 extension. Strict: no ZIP+4 without
//     the dash (e.g. "594011234" is unknown).
//
// Returns a discriminated union so the caller's downstream branch can
// exhaustively narrow on the string.

const CA_POSTAL = /^[A-Z]\d[A-Z]\s*\d[A-Z]\d$/i;
const US_ZIP = /^\d{5}(-\d{4})?$/;

export function detectCountry(code: string): "CA" | "US" | "unknown" {
  const trimmed = code.trim();
  if (!trimmed) return "unknown";
  if (CA_POSTAL.test(trimmed)) return "CA";
  if (US_ZIP.test(trimmed)) return "US";
  return "unknown";
}
