import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readPrompt(fileName: string): string {
  return readFileSync(join(process.cwd(), "docs", "reference", fileName), "utf8");
}

function expectSharedXBundleGuardrails(prompt: string) {
  expect(prompt).toContain("npm run friday-x-signal-bundle");
  expect(prompt).toContain("guardrails.no_grok_llm_in_desk_loop = true");
  expect(prompt).toContain("friday_x_signal_bundle_v1");
  expect(prompt).toContain("post_url");
  expect(prompt).toContain("post_date");
  expect(prompt).toContain("source_cred_tier");
  expect(prompt).toContain("allowed_claims");
  expect(prompt).toContain("blocked_claims");
  expect(prompt).toContain("needs_official_verification");
  expect(prompt).toContain("corroboration");
  expect(prompt).toContain("Price-sensitive signals have matching `price_context`");
  expect(prompt).toContain("X can explain why a risk deserves review; it cannot prove");
  expect(prompt).toContain("llm_metadata.x_signal_bundle_audit");
}

describe("Friday desk prompt X bundle contract", () => {
  it("keeps the CAD desk using Grok-scouted X only as untrusted evidence", () => {
    const prompt = readPrompt("grain-desk-swarm-prompt.md");

    expect(prompt).toContain("Grok never writes, ranks, or authors the desk thesis");
    expect(prompt).toContain("No xAI / Grok LLM anywhere in the V2 loop");
    expect(prompt).toContain("official packets independently prove them");
    expect(prompt).toContain("Official source packets, CGC data, CFTC, and price tape outrank X chatter");
    expect(prompt).toContain("Viking L2");
    expectSharedXBundleGuardrails(prompt);
  });

  it("keeps the US desk using Grok-scouted X only as untrusted evidence", () => {
    const prompt = readPrompt("us-desk-swarm-prompt.md");

    expect(prompt).toContain("Grok never writes, ranks, or authors the US desk thesis");
    expect(prompt).toContain("NO xAI, NO Grok, NO non-Anthropic external LLM anywhere in the US chain");
    expect(prompt).toContain("USDA, CFTC, WASDE, export sales, crop progress, or price packets independently prove them");
    expect(prompt).toContain("USDA, CFTC, WASDE, export sales, crop progress, and price tape outrank X chatter");
    expect(prompt).toContain("Query Viking L2");
    expectSharedXBundleGuardrails(prompt);
  });
});
