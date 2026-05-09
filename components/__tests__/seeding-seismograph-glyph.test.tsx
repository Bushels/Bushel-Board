import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { SeismographGlyph } from "@/components/dashboard/seeding-seismograph-glyph";
import type { SeismographRow } from "@/lib/queries/seeding-progress-utils";

const stateRows: SeismographRow[] = Array.from({ length: 5 }, (_, i) => ({
  state_code: "IA",
  state_name: "Iowa",
  centroid_lng: -93.5,
  centroid_lat: 42.07,
  week_ending: `2026-05-${String(4 + i * 7).padStart(2, "0")}`,
  planted_pct: i * 20,
  emerged_pct: Math.max(0, (i - 1) * 15),
  harvested_pct: 0,
  planted_pct_vs_avg: 5,
  good_excellent_pct: 70 - i,
  condition_index: 3.5 + i * 0.05,
  ge_pct_yoy_change: 4,
}));

describe("SeismographGlyph", () => {
  it("renders state code and commodity label in textContent", () => {
    const { container } = render(
      <SeismographGlyph
        rows={stateRows}
        commodity="Corn"
        currentWeek="2026-05-18"
      />
    );
    expect(container.textContent).toContain("IA");
    expect(container.textContent).toContain("Corn");
  });

  it("SVG has viewBox '0 0 64 48'", () => {
    const { container } = render(
      <SeismographGlyph
        rows={stateRows}
        commodity="Corn"
        currentWeek="2026-05-18"
      />
    );
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("viewBox")).toBe("0 0 64 48");
  });

  it("arrow-up class is present when ge_pct_yoy_change is positive (>=3)", () => {
    const upRows = stateRows.map((r) => ({ ...r, ge_pct_yoy_change: 5 }));
    const { container } = render(
      <SeismographGlyph
        rows={upRows}
        commodity="Corn"
        currentWeek="2026-05-18"
      />
    );
    const arrow = container.querySelector(".arrow-up");
    expect(arrow).not.toBeNull();
  });

  it("arrow-down class is present when ge_pct_yoy_change is severely negative (-19)", () => {
    const downRows = stateRows.map((r) => ({ ...r, ge_pct_yoy_change: -19 }));
    const { container } = render(
      <SeismographGlyph
        rows={downRows}
        commodity="Corn"
        currentWeek="2026-05-18"
      />
    );
    const arrow = container.querySelector(".arrow-down");
    expect(arrow).not.toBeNull();
  });

  it("returns null when rows is empty array", () => {
    const { container } = render(
      <SeismographGlyph rows={[]} commodity="Corn" currentWeek="2026-05-18" />
    );
    expect(container.firstChild).toBeNull();
  });
});
