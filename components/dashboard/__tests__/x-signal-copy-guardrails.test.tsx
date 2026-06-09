import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { CompactSignalStrip } from "@/components/dashboard/compact-signal-strip";
import { EvidenceDrawer } from "@/components/dashboard/evidence-drawer";
import type { XMarketSignal } from "@/lib/queries/x-signals";

const UNSAFE_SUMMARY = "buy Canola, pricing-recommendation, and trade / signal chatter.";
const SAFE_SUMMARY = "watch term Canola, watch term, and watch term chatter.";

beforeAll(() => {
  HTMLElement.prototype.scrollTo = vi.fn() as typeof HTMLElement.prototype.scrollTo;
  HTMLElement.prototype.scrollBy = vi.fn() as typeof HTMLElement.prototype.scrollBy;
});

function makeXSignal(): XMarketSignal {
  return {
    id: "signal-1",
    grain: "Canola",
    post_summary: UNSAFE_SUMMARY,
    post_url: null,
    post_author: "trusted",
    post_date: "2026-06-07T20:00:00Z",
    relevance_score: 92,
    sentiment: "bullish",
    category: "price",
    confidence_score: 84,
    search_query: "canola",
    searched_at: "2026-06-07T20:00:00Z",
    source: "x",
  };
}

describe("X signal copy guardrails", () => {
  it("sanitizes compact signal strip text and fallback X search links", () => {
    const { container } = render(
      <CompactSignalStrip
        signals={[
          {
            grain: "Canola",
            sentiment: "bullish",
            category: "price",
            post_summary: UNSAFE_SUMMARY,
            post_author: "trusted",
            searched_at: "2026-06-07T20:00:00Z",
          },
        ]}
      />,
    );

    expect(container.textContent).toContain(SAFE_SUMMARY);
    expect(container.textContent).not.toMatch(/buy Canola|pricing-recommendation|trade \/ signal/i);

    const href = container.querySelector<HTMLAnchorElement>("a[href*='x.com/search']")?.href ?? "";
    expect(decodeURIComponent(href)).toContain(SAFE_SUMMARY);
    expect(decodeURIComponent(href)).not.toMatch(/buy Canola|pricing-recommendation|trade \/ signal/i);
  });

  it("sanitizes evidence drawer post summaries", () => {
    render(<EvidenceDrawer signals={[makeXSignal()]} grainName="Canola" />);

    fireEvent.click(screen.getByRole("button", { name: /view x sources/i }));

    expect(screen.getByText(SAFE_SUMMARY)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/buy Canola|pricing-recommendation|trade \/ signal/i);
  });
});
