---
name: schedule
description: "Create a scheduled task that runs automatically on a recurring schedule, fires once at a specific time, or is triggered manually on demand. Use when the user says: 'remind me', 'schedule this', 'run this every', 'do this daily/weekly/hourly', 'set a timer', 'automate this task', 'create a recurring job', 'save this as a task', or wants to turn any workflow from the current session into a reusable, repeatable shortcut. Also trigger when the user references cron, scheduling, or automation of session work. Do NOT use for one-off tasks the user wants done right now (just do them), calendar events (use a calendar tool), or alarm clocks."
license: Complete terms in LICENSE.txt
---

# Scheduled Task Creation

Turn any session workflow into a reusable task that runs on a schedule, at a specific time, or on demand. The task prompt must be entirely self-contained — future runs have no access to this session's context.

## Workflow

### 1. Analyze the session
Review the conversation to identify the core task the user performed or requested. Distill it into a single, repeatable objective.

### 2. Draft a self-contained prompt
The prompt powers future autonomous runs. It must include everything needed to execute cold:

- A clear objective statement (what to accomplish)
- Specific steps to execute
- All relevant file paths, URLs, repositories, or tool names
- Expected output or success criteria
- Any constraints or preferences the user expressed

Write in second-person imperative ("Check the inbox…", "Run the test suite…"). Never reference "the current conversation," "the above," or any ephemeral context.

### 3. Choose a taskName
Pick a short, descriptive kebab-case identifier: `daily-inbox-summary`, `weekly-dep-audit`, `format-pr-description`.

### 4. Determine scheduling

| Type | When to use | Parameter |
|------|------------|-----------|
| **Recurring** | "every morning", "weekdays at 5pm", "hourly" | `cronExpression` (LOCAL timezone, not UTC) |
| **One-time** | "remind me in 5 min", "tomorrow at 3pm", "next Friday" | `fireAt` (ISO 8601 with timezone offset) |
| **Ad-hoc** | No automatic run; user triggers manually | Omit both |
| **Ambiguous** | User didn't specify clearly | Propose a schedule and confirm before proceeding |

**Cron format**: `minute hour dayOfMonth month dayOfWeek` — evaluated in user's LOCAL timezone.
- `0 9 * * *` → Every day at 9:00 AM local
- `0 9 * * 1-5` → Weekdays at 9:00 AM local
- `30 8 * * 1` → Every Monday at 8:30 AM local

**fireAt format**: Full ISO 8601 with offset — `2026-03-05T14:30:00-08:00`. The task fires once, then auto-disables.

### 5. Create the task
Call the `create_scheduled_task` tool with taskId, prompt, description, and the appropriate scheduling parameter.

## Examples

**Example 1: Daily email digest**
User says: "Summarize my unread emails every morning at 8am"
→ taskId: `daily-email-digest`, cronExpression: `0 8 * * *`, prompt: "Check the user's inbox for unread emails. Summarize the top 10 by sender, subject, and urgency. Output a brief digest."

**Example 2: One-time reminder**
User says: "Remind me to submit the report in 2 hours"
→ taskId: `submit-report-reminder`, fireAt: computed ISO timestamp 2 hours from now, prompt: "Remind the user to submit the quarterly report. Include the file path if known."

**Example 3: Ad-hoc reusable task**
User says: "Save this cleanup script so I can run it whenever"
→ taskId: `cleanup-downloads`, omit cron/fireAt, prompt: "Scan ~/Downloads for files older than 30 days. List them and ask the user which to delete."

## Common Issues

- **Task doesn't run**: Check that the cron expression uses LOCAL time, not UTC. `0 9 * * *` means 9 AM in the user's timezone.
- **One-time task missed**: If the app was closed when `fireAt` was scheduled, the task fires on next app launch. Use `fireAt` for reminders, not cron.
- **Prompt references this session**: Future runs are cold starts with no session context. If the prompt says "the file we discussed," it will fail. Always include explicit paths and details.
- **Task fires but does nothing useful**: The prompt must be actionable. "Do the thing" won't work. Include specific steps, tools, and expected output.
