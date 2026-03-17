---
name: documentation-patrol
description: Post-implementation staleness detection — 5-point cross-reference check for CLAUDE.md, agent docs, deleted exports, component docs, and monitoring queries. MUST be invoked after any code change before Gate 4 (Document) is complete.
---

# Documentation Patrol — Staleness Detection

## When To Trigger

This skill is a MANDATORY post-implementation gate. Run after ANY code change before marking Gate 4 (Document) complete.

## The 5-Point Cross-Reference Check

### 1. CLAUDE.md Cross-Reference
Grep CLAUDE.md for any literals, constant names, emoji, function names, or component names that were changed in the implementation. If found, update them.

**Examples:**
- Code changed emojis (🔒📦⚖️) to Lucide icons → grep CLAUDE.md for those emojis → update references
- RPC `get_foo()` renamed to `get_bar()` → grep CLAUDE.md for `get_foo` → update
- New table added → add to Tables list in Intelligence Pipeline section
- New RPC created → add to RPC functions list

**Command:** `grep -rn "old_pattern" CLAUDE.md`

### 2. Agent Doc Cross-Reference
If a convention, format, or pattern was changed, grep ALL files in `.claude/agents/` for the old pattern.

**Critical Lesson:** The crop year format bug (2025-26 vs 2025-2026) propagated because agent docs referenced the wrong format. This caused 6 files to use the wrong convention.

**Command:** `grep -rn "old_pattern" .claude/agents/`

### 3. Deleted Export Verification
If files or exports were removed, grep the entire codebase to confirm nothing still imports them.

**Command:** `grep -rn "import.*deletedName" --include="*.ts" --include="*.tsx"`

### 4. Component Doc Sync
If dashboard components were added, removed, or renamed, update `components/dashboard/CLAUDE.md` component table.

**Check:** Read `components/dashboard/CLAUDE.md` and verify it matches the actual components in that directory.

### 5. Monitoring Query Sync
If RPCs or tables were added/removed, update the Pipeline Monitoring section in CLAUDE.md with corresponding diagnostic queries.

**Check:** Every RPC in the RPC inventory should have a corresponding monitoring query in CLAUDE.md's Pipeline Monitoring section.

## Critical Lessons

- **Emoji staleness:** CLAUDE.md referenced old emoji icons (🔒📦⚖️🚜🚛) after they were replaced with Lucide SVG icons. Persisted until manually caught.
- **Crop year propagation:** Agent doc said `"2025-26"` when standard is `"2025-2026"`. Propagated across 6 files before discovery.
- **Track #17:** 9 bugs shipped because gates 3-5 were skipped. Documentation gate would have caught convention drift.

## Procedure

1. Identify what changed in the implementation (file names, function names, conventions, components)
2. Run check #1: grep CLAUDE.md for changed patterns
3. Run check #2: grep .claude/agents/ for changed patterns
4. Run check #3: grep codebase for deleted imports/exports
5. Run check #4: verify components/dashboard/CLAUDE.md matches actual files
6. Run check #5: verify Pipeline Monitoring queries cover all RPCs/tables
7. Fix any staleness found
8. Mark Gate 4 complete only after all 5 checks pass
