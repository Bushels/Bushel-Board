# Audit Report Template

Use this structure for both skill and agent audits.

## JSON Shape

```json
{
  "target_type": "skill",
  "target_name": "skill-auditor",
  "target_path": ".agents/skills/skill-auditor/SKILL.md",
  "run_id": "2026-03-14T19-30-00",
  "evidence_level": "observed",
  "mode": "skill",
  "category_scores": {
    "task_success": 4,
    "instruction_compliance": 4,
    "trigger_quality": 3,
    "resource_leverage": 3,
    "tool_hygiene": 4,
    "safety": 5,
    "efficiency": 3
  },
  "weighted_total": 76.0,
  "grade": "C",
  "disposition": "hold",
  "hard_gates": {
    "task_success": true,
    "safety": true,
    "replay_present": false,
    "no_canary_regression": true
  },
  "findings": [
    "Trigger language was too broad for generic code review requests.",
    "The skill hid its replay guidance too deep in the body."
  ],
  "proposed_changes": [
    "Tighten the description trigger examples.",
    "Move replay rules into an earlier section."
  ],
  "replay_plan": {
    "failed_slice": "Re-run the exact prompt that caused the over-trigger.",
    "near_neighbor": "Use a similar prompt that should still trigger the skill.",
    "canary": "Use a generic code review prompt that should not trigger the skill."
  },
  "summary": "Usable candidate, but not ready for promotion without replay."
}
```

## Short Markdown Summary

```markdown
# Audit Summary

- Target: skill-auditor
- Evidence: observed
- Total: 76.0
- Grade: C
- Disposition: hold

## Main Findings
- Trigger language was too broad.
- Replay guidance was buried too deep.

## Proposed Changes
- Tighten negative triggers.
- Move replay policy earlier in the workflow.

## Replay Plan
- Failed slice: original over-trigger prompt
- Near-neighbor: related audit request
- Canary: generic code review request
```
