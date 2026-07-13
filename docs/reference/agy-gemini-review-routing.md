# AGY Gemini Review Routing

Use this when Bushel Board needs a Gemini-family second opinion from Codex.

## Current Rule

- Use AGY CLI, not the deprecated Gemini CLI.
- Do not route new work through `gemini`, `gemini.ps1`, `@google/gemini-cli`, or old Gemini CLI notes unless the tool is explicitly revived and re-tested.
- Default model label: `Gemini 3.5 Flash (High)`.
- AGY is an adversarial review lane. It can flag missing evidence, stale inputs, bad prompts, future leakage, and scoring contradictions, but it does not write source-truth rows or override the board without a source-backed change.

## Commands

```powershell
agy --version
agy update
agy --model "Gemini 3.5 Flash (High)" --print-timeout 10m --print "<review prompt>"
```

AGY also reads the default model from:

```text
%USERPROFILE%\.gemini\antigravity-cli\settings.json
```

Expected setting:

```json
{
  "model": "Gemini 3.5 Flash (High)"
}
```

## Codex Shell Quirk

In this Codex shell, `agy --print` can return blank stdout even when the model generated a response. Do not fall back to the deprecated Gemini CLI when that happens.

Use a log file and the AGY conversation id instead:

```powershell
agy --model "Gemini 3.5 Flash (High)" --print-timeout 10m --log-file scratch\agy-review.log --print "<review prompt>"
```

If stdout is blank, inspect the log for the conversation id and recover the response from:

```text
%USERPROFILE%\.gemini\antigravity-cli\conversations\<conversation-id>.db
```

## Prompt Boundary

For Wheat thesis review, keep AGY in read-only critique mode:

```text
You are reviewing the Bushel Board Wheat thesis as an external adversarial analyst.
Do not write files, run commands, browse, or mutate anything.
Use only the evidence provided in this prompt.
Flag stale data, missing data, scoring contradictions, future leakage, and public-facing claim risk.
Return: verdict, rating recommendation, missing evidence, scoring concerns, and publish-risk notes.
```

AGY review is strongest after the official data loop has already produced a source-backed Wheat read. It is not a substitute for CGC, USDA, CFTC, price, or scored board rows.
