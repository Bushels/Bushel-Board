import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildGrokCliScoutArgs,
  extractGrokCliScoutText,
  isGrokCliAuthReauthRequired,
  prepareGrokScoutEnvironment,
  resolveGrokCliModel,
  resolveScoutRunner,
} from "@/scripts/run-grok-x-scout";

function testEnv(values: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return { NODE_ENV: "test", ...values };
}

describe("grok x scout runner", () => {
  it("limits the Grok CLI scout to web search and denies write/MCP tools", () => {
    const args = buildGrokCliScoutArgs({
      promptPath: "C:/tmp/prompt.md",
      workingDir: "C:/tmp/bushel-grok-x-scout",
      maxTurns: 12,
    });

    expect(args[args.indexOf("--tools") + 1]).toBe("web_search");
    expect(args[args.indexOf("--max-turns") + 1]).toBe("12");
    expect(args[args.indexOf("--disallowed-tools") + 1]).toContain("run_terminal_cmd");
    expect(args[args.indexOf("--disallowed-tools") + 1]).toContain("write_file");
    expect(args).toContain("MCPTool(*)");
    expect(args).toContain("Write(*)");
    expect(args).toContain("--no-subagents");
    expect(args).toContain("--no-memory");
  });

  it("passes an explicit Grok Build model without changing scout tool guardrails", () => {
    const args = buildGrokCliScoutArgs({
      promptPath: "C:/tmp/prompt.md",
      workingDir: "C:/tmp/bushel-grok-x-scout",
      maxTurns: 12,
      model: "composer-2.5",
    });

    expect(args[args.indexOf("--model") + 1]).toBe("composer-2.5");
    expect(args[args.indexOf("--tools") + 1]).toBe("web_search");
    expect(args[args.indexOf("--disallowed-tools") + 1]).toContain("write_file");
    expect(args).toContain("MCPTool(*)");
    expect(args).toContain("Write(*)");
  });

  it("resolves the Grok CLI model from flags, env, or npm positional arguments", () => {
    expect(resolveGrokCliModel(["--grok-cli-model", "grok-composer-2.5-fast"], testEnv())).toBe(
      "grok-composer-2.5-fast",
    );
    expect(resolveGrokCliModel(["daily_pulse", "grok_cli", "grok-composer-2.5-fast"], testEnv())).toBe(
      "grok-composer-2.5-fast",
    );
    expect(resolveGrokCliModel(["daily_pulse", "grok_cli"], testEnv({ GROK_CLI_MODEL: "grok-build" }))).toBe("grok-build");
  });

  it("prepares a temporary Grok home with copied auth and disabled noisy connectors", () => {
    const root = mkdtempSync(resolve(tmpdir(), "bushel-grok-runner-test-"));
    const sourceGrokHome = resolve(root, "source-grok");
    const workingDir = resolve(root, "work");
    mkdirSync(sourceGrokHome, { recursive: true });
    mkdirSync(workingDir, { recursive: true });
    writeFileSync(resolve(sourceGrokHome, "auth.json"), "{\"token\":\"test\"}", "utf-8");
    writeFileSync(resolve(sourceGrokHome, "agent_id"), "agent-test", "utf-8");

    const env = prepareGrokScoutEnvironment(workingDir, testEnv({
      GROK_HOME: sourceGrokHome,
      PATH: process.env.PATH,
    }));

    const grokHome = resolve(workingDir, ".grok");
    const config = readFileSync(resolve(grokHome, "config.toml"), "utf-8");
    expect(env.GROK_HOME).toBe(grokHome);
    expect(env.HOME).toBe(workingDir);
    expect(env.USERPROFILE).toBe(workingDir);
    expect(env.GROK_SUBAGENTS).toBe("0");
    expect(env.GROK_MEMORY).toBe("0");
    expect(existsSync(resolve(grokHome, "auth.json"))).toBe(true);
    expect(existsSync(resolve(grokHome, "agent_id"))).toBe(true);
    expect(config).toContain("[mcp_servers.slack]");
    expect(config).toContain("[mcp_servers.vercel]");
    expect(config).toContain("[mcp_servers.supabase]");
    expect(config).toContain("[mcp_servers.gemini-cli]");
    expect(config).toContain('command = "node"');
    expect(config).toContain('args = ["-e", "process.exit(0)"]');
    expect(config).toContain("enabled = false");
  });

  it("extracts scout JSON from the Grok CLI json output envelope", () => {
    const scoutJson = JSON.stringify({
      schema_version: "grok_x_scout_v1",
      run_date: "2026-06-03",
      mode: "daily_pulse",
      search_windows: [],
      signals: [],
      no_signal_notes: [],
    });

    expect(extractGrokCliScoutText(JSON.stringify({ text: scoutJson, stopReason: "EndTurn" }))).toBe(scoutJson);
    expect(extractGrokCliScoutText(scoutJson)).toBe(scoutJson);
  });

  it("detects Grok CLI re-auth prompts before the scout timeout expires", () => {
    expect(isGrokCliAuthReauthRequired("auth: token expired, silent refresh failed - re-authentication required")).toBe(true);
    expect(isGrokCliAuthReauthRequired("Open this URL to sign in: https://auth.x.ai/oauth2/authorize")).toBe(true);
    expect(isGrokCliAuthReauthRequired("normal search warning")).toBe(false);
  });

  it("resolves auto runner to xai_api when XAI_API_KEY is present", () => {
    expect(resolveScoutRunner("auto", testEnv({ XAI_API_KEY: "xai-test" }), "C:/missing")).toBe("xai_api");
  });

  it("resolves auto runner to xai_api when .env.local has XAI_API_KEY", () => {
    const root = mkdtempSync(resolve(tmpdir(), "bushel-grok-runner-test-"));
    writeFileSync(resolve(root, ".env.local"), "XAI_API_KEY=xai-test\n", "utf-8");

    expect(resolveScoutRunner("auto", testEnv(), root)).toBe("xai_api");
  });

  it("resolves auto runner to grok_cli without an API key", () => {
    const root = mkdtempSync(resolve(tmpdir(), "bushel-grok-runner-test-"));

    expect(resolveScoutRunner("auto", testEnv(), root)).toBe("grok_cli");
  });
});
