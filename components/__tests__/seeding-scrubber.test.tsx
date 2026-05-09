import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { SeedingScrubber } from "@/components/dashboard/seeding-scrubber";

const weeks = ["2026-04-19", "2026-04-26", "2026-05-03", "2026-05-10"];

// Mock window.matchMedia to report no reduced-motion preference
const mockMatchMedia = (matches: boolean) => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
};

describe("SeedingScrubber", () => {
  beforeEach(() => {
    // Default: reduced-motion OFF so the replay button is visible
    mockMatchMedia(false);
  });

  it("renders the current week label", () => {
    const { getByText } = render(
      <SeedingScrubber
        weeks={weeks}
        currentWeek="2026-04-26"
        onChange={() => {}}
      />
    );
    expect(getByText(/Week ending 2026-04-26/)).toBeTruthy();
  });

  it("slider has correct min, max, and value attributes", () => {
    const { getByRole } = render(
      <SeedingScrubber
        weeks={weeks}
        currentWeek="2026-05-03"
        onChange={() => {}}
      />
    );
    const slider = getByRole("slider");
    expect(slider.getAttribute("min")).toBe("0");
    expect(slider.getAttribute("max")).toBe(String(weeks.length - 1));
    // currentWeek = "2026-05-03" is at index 2
    expect((slider as HTMLInputElement).value).toBe("2");
  });

  it("slider onChange calls props.onChange with the corresponding week", () => {
    const handleChange = vi.fn();
    const { getByRole } = render(
      <SeedingScrubber
        weeks={weeks}
        currentWeek="2026-04-19"
        onChange={handleChange}
      />
    );
    const slider = getByRole("slider");
    // Fire change event selecting index 3
    fireEvent.change(slider, { target: { value: "3" } });
    expect(handleChange).toHaveBeenCalledWith("2026-05-10");
  });

  it("replay button is rendered when reduced-motion is not active", () => {
    const { getByText } = render(
      <SeedingScrubber
        weeks={weeks}
        currentWeek="2026-04-19"
        onChange={() => {}}
      />
    );
    // Button should say "Replay season" initially
    expect(getByText(/Replay season/i)).toBeTruthy();
  });

  it("slider has aria-label 'Select week'", () => {
    const { getByRole } = render(
      <SeedingScrubber
        weeks={weeks}
        currentWeek="2026-04-19"
        onChange={() => {}}
      />
    );
    const slider = getByRole("slider");
    expect(slider.getAttribute("aria-label")).toBe("Select week");
  });
});
