import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildHermesXScoutArtifact,
  buildHermesXScoutPrompt,
  normalizeHermesXScoutRawJson,
} from "@/scripts/build-hermes-x-scout-artifact";
import { runHermesXScoutTerminal } from "@/scripts/run-hermes-x-scout-terminal";

function hermesRaw(runDate = "2026-06-08") {
  return JSON.stringify({
    schema_version: "grok_x_scout_v1",
    run_date: runDate,
    mode: "daily_pulse",
    search_windows: [
      { label: "previous_24h", from_date: "2026-06-07", to_date: runDate },
    ],
    signals: [
      {
        source_url: `https://x.com/realagriculture/status/${runDate.replaceAll("-", "")}`,
        post_id: runDate.replaceAll("-", ""),
        handle: "realagriculture",
        posted_at: `${runDate}T17:00:00Z`,
        raw_quote: "Prairie crop policy pressure remains active.",
        summary: "RealAgriculture flags prairie crop policy pressure.",
        primary_grain: "Wheat",
        affected_grains: ["Wheat", "Canola"],
        affected_regions: ["Saskatchewan", "Alberta"],
        category: "policy",
        direction: "bearish",
        time_sensitivity: "same_day",
        seasonal_phase: "growing",
        why_it_matters: "Policy pressure can affect confidence and movement timing.",
        confidence: 0.71,
        needs_official_verification: false,
        claimed_numbers: [],
      },
    ],
    no_signal_notes: [],
  });
}

describe("Hermes X scout artifact bridge", () => {
  it("builds a Hermes prompt that preserves the Track 54 scout-only boundary", () => {
    const prompt = buildHermesXScoutPrompt({
      cwd: "C:/Users/kyle/Agriculture/bushel-board-app",
      mode: "daily_pulse",
      runDate: "2026-06-08",
      artifactRoot: "data/X Scout Runs",
      artifactStem: "daily_pulse-hermes-test",
    });

    expect(prompt).toContain("Grok 4.3");
    expect(prompt).toContain("You are not the thesis writer.");
    expect(prompt).toContain("You must not write Supabase rows.");
    expect(prompt).toContain("Return exactly one raw JSON object.");
    expect(prompt).toContain("daily_pulse-hermes-test-raw.json");
    expect(prompt).toContain("Batch 1:");
  });

  it("normalizes fenced Hermes JSON without weakening the schema", () => {
    const normalized = normalizeHermesXScoutRawJson(`\`\`\`json\n${hermesRaw()}\n\`\`\``);

    expect(normalized.normalizedFromMarkdown).toBe(true);
    expect(normalized.output.schema_version).toBe("grok_x_scout_v1");
    expect(normalized.output.signals).toHaveLength(1);
    expect(normalized.normalizedJson).toContain("\"mode\": \"daily_pulse\"");
  });

  it("writes no-write Hermes raw and summary artifacts that the reviewer can inspect", () => {
    const root = mkdtempSync(resolve(tmpdir(), "hermes-x-scout-"));

    const result = buildHermesXScoutArtifact({
      cwd: root,
      mode: "daily_pulse",
      runDate: "2026-06-08",
      artifactRoot: "data/X Scout Runs",
      priceSnapshotStatus: "fresh",
      rawInput: hermesRaw(),
    });

    expect(result.dry_run).toBe(true);
    expect(result.write).toBe(false);
    expect(result.runner).toBe("hermes_grok_4_3");
    expect(result.scout_run_id).toBeNull();
    expect(result.price_snapshot_status).toBe("fresh");
    expect(result.raw_signal_count).toBe(1);
    expect(result.accepted_signal_count).toBe(1);
    expect(result.rejected_signal_count).toBe(0);
    expect(result.artifact_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(existsSync(result.prompt_path)).toBe(true);
    expect(result.artifact_path && existsSync(result.artifact_path)).toBe(true);
    expect(result.summary_path && existsSync(result.summary_path)).toBe(true);

    const summary = JSON.parse(readFileSync(result.summary_path!, "utf-8")) as Record<string, unknown>;
    expect(summary.dry_run).toBe(true);
    expect(summary.write).toBe(false);
    expect(summary.accepted_signal_count).toBe(1);
    expect(summary.scout_run_id).toBeNull();
  });

  it("can write only the prompt for the operator to paste into Hermes", () => {
    const root = mkdtempSync(resolve(tmpdir(), "hermes-x-scout-"));

    const result = buildHermesXScoutArtifact({
      cwd: root,
      mode: "daily_pulse",
      runDate: "2026-06-08",
      artifactRoot: "data/X Scout Runs",
      promptOnly: true,
    });

    expect(result.prompt_path).toContain("daily_pulse-hermes-");
    expect(existsSync(result.prompt_path)).toBe(true);
    expect(result.artifact_path).toBeNull();
    expect(result.summary_path).toBeNull();
    expect(result.next_actions[0]).toContain("Paste the prompt into Hermes");
  });

  it("keeps terminal Hermes prompt, raw, and summary artifacts on the same stem", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "hermes-x-scout-terminal-"));

    const result = await runHermesXScoutTerminal(
      {
        cwd: root,
        mode: "daily_pulse",
        runDate: "2026-06-08",
        artifactRoot: "data/X Scout Runs",
        scratchDir: "scratch/hermes-x-scout",
        priceSnapshotStatus: "fresh",
        artifactStem: "daily_pulse-hermes-terminal-test",
      },
      ({ provider, model, toolsets }) => ({
        status: 0,
        stdout: hermesRaw(),
        stderr: "",
        command: ["hermes", "-z", "<prompt>", "--provider", provider, "-m", model, "-t", toolsets],
      }),
    );

    expect(result.dry_run).toBe(true);
    expect(result.write).toBe(false);
    expect(result.provider).toBe("xai-oauth");
    expect(result.model).toBe("grok-4.3");
    expect(result.toolsets).toBe("x_search");
    expect(result.import_result.scout_run_id).toBeNull();
    expect(result.import_result.artifact_stem).toBe("daily_pulse-hermes-terminal-test");
    expect(result.prompt_path).toContain("daily_pulse-hermes-terminal-test-prompt.md");
    expect(result.import_result.artifact_path).toContain("daily_pulse-hermes-terminal-test-raw.json");
    expect(result.import_result.summary_path).toContain("daily_pulse-hermes-terminal-test-summary.json");
    expect(existsSync(result.raw_response_path)).toBe(true);
  });
});
