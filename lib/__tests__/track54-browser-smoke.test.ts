import { describe, expect, it } from "vitest";
import {
  buildProof,
  type RouteSmokeResult,
} from "@/scripts/run-track54-browser-smoke";

function routeResult(
  route: string,
  viewport: "desktop" | "mobile",
  overrides: Partial<RouteSmokeResult> = {},
): RouteSmokeResult {
  return {
    route,
    viewport,
    url: `http://127.0.0.1:3110${route}`,
    state: {
      href: `http://127.0.0.1:3110${route}`,
      title: "Bushel Board - Prairie Grain Intelligence",
      markerHits: [
        { marker: "Source health", present: true },
        { marker: "Weekly Data Intake", present: true },
      ],
      visibleMarkerHits: [
        { marker: "Source health", present: true, visible: true, unobscured: true },
        { marker: "Weekly Data Intake", present: true, visible: true, unobscured: true },
      ],
      forbiddenHits: [],
      hasErrorOverlay: false,
      bodyLength: 2400,
    },
    interaction: {
      name: "theme_toggle",
      ok: true,
      detail: "before=light after=dark restored=light",
    },
    errors: [],
    screenshot_path: `scratch/track54-browser-smoke/proof/${viewport}-${route.replace(/[^a-z0-9]+/gi, "-")}.png`,
    screenshot_bytes: 12_345,
    screenshot_dimensions: viewport === "desktop"
      ? { width: 1024, height: 768 }
      : { width: 390, height: 844 },
    screenshot_visual: {
      sample_pixels: 6912,
      distinct_colors: 42,
      non_white_ratio: 0.38,
      luma_range: 196.4,
    },
    ...overrides,
  };
}

describe("Track 54 browser smoke proof", () => {
  it("records route, viewport, console, interaction, and screenshot proof lines", () => {
    const proof = buildProof(
      "http://127.0.0.1:3110",
      [
        routeResult("/thesis", "desktop"),
        routeResult("/thesis", "mobile"),
      ],
      true,
    );

    expect(proof.checked).toBe(true);
    expect(proof.ok).toBe(true);
    expect(proof.output).toContain("app_server=started");
    expect(proof.output).toContain("desktop /thesis: loaded http://127.0.0.1:3110/thesis");
    expect(proof.output).toContain("mobile /thesis: loaded http://127.0.0.1:3110/thesis");
    expect(proof.output).toContain("desktop /thesis: visible_markers=Source health:visible, Weekly Data Intake:visible");
    expect(proof.output).toContain(
      "desktop /thesis: interaction=theme_toggle:ok before=light after=dark restored=light",
    );
    expect(proof.output).toContain(
      "mobile /thesis: interaction=theme_toggle:ok before=light after=dark restored=light",
    );
    expect(proof.output).toContain("desktop /thesis: console_errors=0");
    expect(proof.output).toContain("mobile /thesis: forbidden_hits=none");
    expect(proof.output).toContain("desktop /thesis: screenshot_bytes=12345");
    expect(proof.output).toContain("desktop /thesis: screenshot_dimensions=1024x768");
    expect(proof.output).toContain("desktop /thesis: screenshot_visual=sample_pixels=6912 distinct_colors=42 non_white_ratio=0.38 luma_range=196.4");
    expect(proof.output).toContain("mobile /thesis: screenshot_dimensions=390x844");
  });

  it("prefixes failures with viewport and route so readiness reports point at the broken surface", () => {
    const proof = buildProof(
      "http://127.0.0.1:3110",
      [
        routeResult("/overview", "mobile", {
          interaction: {
            name: "theme_toggle",
            ok: false,
            detail: "before=light after=light restored=light",
          },
          errors: ["interaction failed: theme_toggle before=light after=light restored=light"],
        }),
      ],
      false,
    );

    expect(proof.ok).toBe(false);
    expect(proof.output).toContain("app_server=already_reachable");
    expect(proof.output).toContain(
      "mobile /overview: interaction=theme_toggle:failed before=light after=light restored=light",
    );
    expect(proof.output).toContain(
      "mobile /overview: interaction failed: theme_toggle before=light after=light restored=light",
    );
  });

  it("records hidden visible-marker failures in proof output", () => {
    const proof = buildProof(
      "http://127.0.0.1:3110",
      [
        routeResult("/thesis", "mobile", {
          state: {
            ...routeResult("/thesis", "mobile").state,
            visibleMarkerHits: [
              { marker: "Source health", present: true, visible: true, unobscured: true },
              { marker: "Weekly Data Intake", present: true, visible: false, unobscured: false },
            ],
          },
          errors: ["marker was not visibly reachable: Weekly Data Intake (hidden)"],
        }),
      ],
      true,
    );

    expect(proof.ok).toBe(false);
    expect(proof.output).toContain("mobile /thesis: visible_markers=Source health:visible, Weekly Data Intake:hidden");
    expect(proof.output).toContain("mobile /thesis: marker was not visibly reachable: Weekly Data Intake (hidden)");
  });

  it("records covered visible-marker failures in proof output", () => {
    const proof = buildProof(
      "http://127.0.0.1:3110",
      [
        routeResult("/thesis", "desktop", {
          state: {
            ...routeResult("/thesis", "desktop").state,
            visibleMarkerHits: [
              { marker: "Source health", present: true, visible: true, unobscured: true },
              { marker: "Weekly Data Intake", present: true, visible: true, unobscured: false },
            ],
          },
          errors: ["marker was not visibly reachable: Weekly Data Intake (covered)"],
        }),
      ],
      true,
    );

    expect(proof.ok).toBe(false);
    expect(proof.output).toContain("desktop /thesis: visible_markers=Source health:visible, Weekly Data Intake:covered");
    expect(proof.output).toContain("desktop /thesis: marker was not visibly reachable: Weekly Data Intake (covered)");
  });

  it("records low-information screenshot failures in proof output", () => {
    const proof = buildProof(
      "http://127.0.0.1:3110",
      [
        routeResult("/overview", "desktop", {
          screenshot_visual: {
            sample_pixels: 6912,
            distinct_colors: 1,
            non_white_ratio: 0,
            luma_range: 0,
          },
          errors: [
            "screenshot had too few sampled colors: 1",
            "screenshot non-white ratio was too low: 0",
            "screenshot luma range was too low: 0",
          ],
        }),
      ],
      true,
    );

    expect(proof.ok).toBe(false);
    expect(proof.output).toContain("desktop /overview: screenshot_visual=sample_pixels=6912 distinct_colors=1 non_white_ratio=0 luma_range=0");
    expect(proof.output).toContain("desktop /overview: screenshot had too few sampled colors: 1");
    expect(proof.output).toContain("desktop /overview: screenshot non-white ratio was too low: 0");
    expect(proof.output).toContain("desktop /overview: screenshot luma range was too low: 0");
  });
});
