import { describe, it, expect } from "vitest";
import { fmtKt, fmtPct } from "@/lib/utils/format";

describe("fmtKt", () => {
  it("formats large numbers with commas", () => {
    expect(fmtKt(1234.5)).toBe("1,234.5 kt");
  });

  it("formats zero", () => {
    expect(fmtKt(0)).toBe("0.0 kt");
  });

  it("respects decimal parameter", () => {
    expect(fmtKt(1234.567, 2)).toBe("1,234.57 kt");
  });

  it("handles negative values", () => {
    expect(fmtKt(-500)).toContain("-500");
  });
});

describe("fmtPct", () => {
  it("formats positive percentages with +", () => {
    const result = fmtPct(12.5);
    expect(result).toContain("12.5");
    expect(result).toContain("+");
  });

  it("formats negative percentages with -", () => {
    const result = fmtPct(-3.2);
    expect(result).toContain("3.2");
    expect(result).toContain("-");
  });
});
