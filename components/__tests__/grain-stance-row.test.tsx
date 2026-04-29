import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { GrainStanceRow } from "@/components/overview/grain-stance-row";
import type { GrainStanceData } from "@/components/dashboard/market-stance-chart";

function makeRow(overrides: Partial<GrainStanceData> = {}): GrainStanceData {
  return {
    grain: "Canola",
    slug: "canola",
    region: "CA",
    score: 42,
    priorScore: 28,
    confidence: "high",
    cashPrice: "$648.00",
    priceChange: "+$2.40",
    thesisSummary: "Canola is bullish.",
    bullPoints: [{ fact: "Strong crush margins", reasoning: "Domestic oil basis hit 14-month high." }],
    bearPoints: [],
    recommendation: null,
    detailHref: "/grain/canola",
    ...overrides,
  };
}

describe("GrainStanceRow", () => {
  it("renders grain name", () => {
    const { getByText } = render(
      <GrainStanceRow row={makeRow()} isFirst={true} />
    );
    expect(getByText("Canola")).toBeTruthy();
  });

  it("renders positive stance score with + prefix", () => {
    const { getByText } = render(
      <GrainStanceRow row={makeRow({ score: 42 })} isFirst={true} />
    );
    expect(getByText("+42")).toBeTruthy();
  });

  it("renders negative stance score without + prefix", () => {
    const { getByText } = render(
      <GrainStanceRow row={makeRow({ score: -28, grain: "Flaxseed" })} isFirst={false} />
    );
    expect(getByText("-28")).toBeTruthy();
  });

  it("renders zero stance score without + prefix", () => {
    const { getByText } = render(
      <GrainStanceRow row={makeRow({ score: 0, grain: "Barley" })} isFirst={false} />
    );
    expect(getByText("0")).toBeTruthy();
  });

  it("renders WoW delta as arrow + absolute value when prior is set", () => {
    const row = makeRow({ score: 42, priorScore: 28 }); // delta = +14
    const { getByText } = render(<GrainStanceRow row={row} isFirst={true} />);
    expect(getByText("↑14")).toBeTruthy();
  });

  it("renders bearish WoW delta with down arrow", () => {
    const row = makeRow({ score: 10, priorScore: 30 }); // delta = -20
    const { getByText } = render(<GrainStanceRow row={row} isFirst={true} />);
    expect(getByText("↓20")).toBeTruthy();
  });

  it("renders em dash when prior is null", () => {
    const row = makeRow({ priorScore: null });
    const { getAllByText } = render(<GrainStanceRow row={row} isFirst={true} />);
    // "—" appears in the WoW column
    expect(getAllByText("—").length).toBeGreaterThanOrEqual(1);
  });

  it("renders cash price when provided", () => {
    const { getByText } = render(
      <GrainStanceRow row={makeRow({ cashPrice: "$648.00" })} isFirst={true} />
    );
    expect(getByText("$648.00")).toBeTruthy();
  });

  it("does not render price change when null", () => {
    const { container } = render(
      <GrainStanceRow row={makeRow({ priceChange: null })} isFirst={true} />
    );
    // Price change column should be empty div — no +/- text
    expect(container.textContent).not.toMatch(/\+\$|\-\$/);
  });

  it("does not apply visible border when isFirst is true", () => {
    const { container } = render(
      <GrainStanceRow row={makeRow()} isFirst={true} />
    );
    const rootDiv = container.firstChild as HTMLElement;
    // When isFirst, the row should have borderTop "none" (no solid color).
    // jsdom normalises this differently; we test that borderTopColor is not set
    // to the wheat-100 color we use for separators.
    const styleAttr = rootDiv.getAttribute("style") ?? "";
    expect(styleAttr).not.toContain("ebe7dc");
  });

  it("applies top border when isFirst is false", () => {
    const { container } = render(
      <GrainStanceRow row={makeRow()} isFirst={false} />
    );
    const rootDiv = container.firstChild as HTMLElement;
    const styleAttr = rootDiv.getAttribute("style") ?? "";
    expect(styleAttr).toContain("1px solid");
  });
});
