export const TRACK54_WRITE_APPROVAL_PHRASE =
  "I approve enabling Track 54 write-mode Grok routines after reviewing the promotion brief.";

const APPROVAL_FLAGS = ["--approval-phrase", "--track54-approval"] as const;
const APPROVAL_ENV_VAR = "TRACK54_WRITE_APPROVAL";

function optionValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index !== -1) {
    const value = args[index + 1];
    return value && !value.startsWith("--") ? value : "";
  }
  const inline = args.find((arg) => arg.startsWith(`${flag}=`));
  return inline ? inline.slice(flag.length + 1) : undefined;
}

function npmConfigValue(env: NodeJS.ProcessEnv, flag: string): string | undefined {
  const key = `npm_config_${flag.replace(/^--/, "").replace(/-/g, "_")}`;
  const value = env[key];
  return value && value !== "true" ? value : undefined;
}

export function getTrack54WriteApproval(args: string[], env: NodeJS.ProcessEnv = process.env): string | null {
  for (const flag of APPROVAL_FLAGS) {
    const value = optionValue(args, flag);
    if (value !== undefined) return value.trim();
    const envValue = npmConfigValue(env, flag);
    if (envValue !== undefined) return envValue.trim();
  }
  return env[APPROVAL_ENV_VAR]?.trim() || null;
}

export function hasTrack54WriteApproval(args: string[], env: NodeJS.ProcessEnv = process.env): boolean {
  return getTrack54WriteApproval(args, env) === TRACK54_WRITE_APPROVAL_PHRASE;
}

export function assertTrack54WriteApproval(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  workflowLabel = "Track 54 write mode",
): void {
  if (hasTrack54WriteApproval(args, env)) return;

  throw new Error(
    `${workflowLabel} is disabled until the Grok X scout artifact-week review returns ` +
      "`candidate_for_enablement` and human approval is given. " +
      `After approval, pass --approval-phrase "${TRACK54_WRITE_APPROVAL_PHRASE}" ` +
      `or set ${APPROVAL_ENV_VAR} to that exact phrase.`,
  );
}
