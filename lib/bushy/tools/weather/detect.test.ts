// WS4 Task 4.1 — Country detection tests (TDD).
//
// Postal-code format drives country choice:
//   CA: [A-Z]\d[A-Z] \d[A-Z]\d  (space between tripartite is optional)
//   US: \d{5} or \d{5}-\d{4}
//
// Everything else returns 'unknown'. Case-insensitive for Canadian postal
// codes (users often type "t0l 1a0").

import { describe, it, expect } from "vitest";
import { detectCountry } from "./detect";

describe("detectCountry", () => {
  it.each([
    // Canadian — with/without space, mixed case
    ["T0L 1A0", "CA"],
    ["T0L1A0", "CA"],
    ["s4p 3y2", "CA"],
    ["R3C 0J7", "CA"],
    // US — 5-digit + ZIP+4
    ["59401", "US"],
    ["59401-1234", "US"],
    ["12345", "US"],
    ["00501", "US"], // lowest real ZIP
    // Ambiguous / malformed
    ["ABCDE", "unknown"],
    ["", "unknown"],
    ["1234", "unknown"], // too short for ZIP
    ["123456", "unknown"], // too long for bare ZIP, missing dash
    ["T0L-1A0", "unknown"], // wrong separator
    ["   ", "unknown"], // whitespace only
  ])("%s → %s", (input, expected) => {
    expect(detectCountry(input)).toBe(expected);
  });

  it("handles extra whitespace around valid codes", () => {
    expect(detectCountry("  T0L 1A0  ")).toBe("CA");
    expect(detectCountry("\t59401\n")).toBe("US");
  });
});
