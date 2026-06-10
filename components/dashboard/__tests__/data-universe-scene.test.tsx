import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DataUniverseScene } from "@/components/dashboard/data-universe-scene";
import { buildDataUniverse } from "@/lib/thesis/data-universe";

describe("DataUniverseScene", () => {
  it("renders the WebGL fallback, legend, and click prompt under jsdom", async () => {
    render(<DataUniverseScene model={buildDataUniverse([{ grain: "Canola", score: 24, confidence: 82 }])} />);

    expect(screen.getByTestId("data-universe-canvas-frame")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/3D view is unavailable on this device/)).toBeInTheDocument();
    });
    expect(screen.getByText("official inputs")).toBeInTheDocument();
    expect(screen.getByText("price context")).toBeInTheDocument();
    expect(screen.getByText("watch leads")).toBeInTheDocument();
    expect(screen.getByText("pressure lanes")).toBeInTheDocument();
    expect(screen.getByText(/Click any node to see what it is/)).toBeInTheDocument();
  });
});
