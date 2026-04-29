import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { SpotPriceRail } from "@/components/overview/spot-price-rail";
import type { SpotPrice } from "@/lib/queries/overview-data";

function makePrice(overrides: Partial<SpotPrice> = {}): SpotPrice {
  return {
    grain: "Corn",
    symbol: "ZC",
    settlementPrice: 4.62,
    changeAmount: 0.08,
    changePct: 1.76,
    unit: "/bu",
    priceDate: "2026-04-25",
    ...overrides,
  };
}

describe("SpotPriceRail", () => {
  it("renders nothing when prices is empty", () => {
    const { container } = render(<SpotPriceRail prices={[]} />);
    // Component returns null for empty array
    expect(container.firstChild).toBeNull();
  });

  it("renders grain name label", () => {
    const { getByText } = render(
      <SpotPriceRail prices={[makePrice({ grain: "Corn" })]} />
    );
    expect(getByText("Corn")).toBeTruthy();
  });

  it("formats settlement price with two decimal places and $ prefix", () => {
    const { getByText } = render(
      <SpotPriceRail prices={[makePrice({ settlementPrice: 4.62 })]} />
    );
    expect(getByText("$4.62")).toBeTruthy();
  });

  it("shows positive WoW% with + sign", () => {
    const { container } = render(
      <SpotPriceRail prices={[makePrice({ changePct: 1.76 })]} />
    );
    expect(container.textContent).toContain("+1.76%");
  });

  it("shows negative WoW% without + sign", () => {
    const { container } = render(
      <SpotPriceRail
        prices={[makePrice({ changePct: -1.35, changeAmount: -0.14 })]}
      />
    );
    expect(container.textContent).toContain("-1.35%");
  });

  it("renders up arrow for positive change", () => {
    const { container } = render(
      <SpotPriceRail prices={[makePrice({ changeAmount: 0.08 })]} />
    );
    expect(container.textContent).toContain("↑");
  });

  it("renders down arrow for negative change", () => {
    const { container } = render(
      <SpotPriceRail
        prices={[makePrice({ changeAmount: -0.14, changePct: -1.35 })]}
      />
    );
    expect(container.textContent).toContain("↓");
  });

  it("renders all prices when multiple provided", () => {
    const prices = [
      makePrice({ grain: "Corn" }),
      makePrice({ grain: "Soybeans", settlementPrice: 10.24 }),
      makePrice({ grain: "Wheat", settlementPrice: 5.38 }),
    ];
    const { getByText } = render(<SpotPriceRail prices={prices} />);
    expect(getByText("Corn")).toBeTruthy();
    expect(getByText("Soybeans")).toBeTruthy();
    expect(getByText("Wheat")).toBeTruthy();
  });

  it("renders unit label", () => {
    const { getAllByText } = render(
      <SpotPriceRail prices={[makePrice({ unit: "/bu" })]} />
    );
    expect(getAllByText("/bu").length).toBeGreaterThanOrEqual(1);
  });

  it("has CBOT Futures label", () => {
    const { getByText } = render(
      <SpotPriceRail prices={[makePrice()]} />
    );
    expect(getByText(/CBOT Futures/i)).toBeTruthy();
  });
});
