import { describe, expect, it } from "vitest";
import { parseFarmSummary } from "@/lib/utils/farm-summary";

describe("parseFarmSummary", () => {
  it("parses markdown sections and source links", () => {
    const parsed = parseFarmSummary(`
## Confirmed Flow Data
- CGC Week 30 deliveries tightened in wheat.

## This Week's Actions
- Price a small slice if basis firms.

Sources:
- [1] https://example.com/cgc
`.trim());

    expect(parsed.metaTitle).toBeUndefined();
    expect(parsed.sections).toHaveLength(2);
    expect(parsed.sections[0].title).toBe("Confirmed Flow Data");
    expect(parsed.sections[0].blocks[0]).toEqual({
      type: "bullet",
      text: "CGC Week 30 deliveries tightened in wheat.",
    });
    expect(parsed.sources[0]).toEqual({
      label: "[1] https://example.com/cgc",
      url: "https://example.com/cgc",
    });
  });

  it("normalizes legacy bold labels into sections", () => {
    const parsed = parseFarmSummary(`
**Your Farm Summary - Week 32 Shipping (as of March 13, 2026)** **Wheat Progress:** You've moved fast. **Canola Progress:** Holding steady.
Sources:
[1] https://example.com/report
`.trim());

    expect(parsed.metaTitle).toBe("Your Farm Summary - Week 32 Shipping (as of March 13, 2026)");
    expect(parsed.sections).toHaveLength(2);
    expect(parsed.sections[0].title).toBe("Wheat Progress");
    expect(parsed.sections[0].blocks[0]).toEqual({
      type: "paragraph",
      text: "You've moved fast.",
    });
    expect(parsed.sections[1].title).toBe("Canola Progress");
    expect(parsed.sections[1].blocks[0]).toEqual({
      type: "paragraph",
      text: "Holding steady.",
    });
  });

  it("falls back to inline citation URLs when explicit sources are absent", () => {
    const parsed = parseFarmSummary(
      "You are ahead of peers this week [[1]](https://example.com/peer-data)."
    );

    expect(parsed.sections).toHaveLength(1);
    expect(parsed.sections[0].blocks[0]).toEqual({
      type: "paragraph",
      text: "You are ahead of peers this week.",
    });
    expect(parsed.sources[0]).toEqual({
      label: "[1] https://example.com/peer-data",
      url: "https://example.com/peer-data",
    });
  });
});
