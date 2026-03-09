---
name: web-artifacts-builder
description: "Suite of tools for creating elaborate, multi-component claude.ai HTML artifacts using modern frontend web technologies (React, Tailwind CSS, shadcn/ui). Use when the user says: 'build a complex artifact', 'create a multi-page app', 'build a React app', 'I need shadcn components', 'create an interactive tool', 'build a dashboard artifact', or asks for artifacts requiring state management, routing, multiple components, or shadcn/ui. Also trigger for 'build something with React and Tailwind', 'complex web app', or 'multi-component artifact'. Do NOT use for simple single-file HTML/JSX artifacts (Claude can handle those directly), static posters or print designs (use canvas-design), slide decks (use pptx), or data visualizations that don't need React (use data-visualization)."
---

# Web Artifacts Builder

Build powerful frontend claude.ai artifacts with React, TypeScript, Tailwind CSS, and shadcn/ui.

## Workflow

1. Initialize the frontend repo using `scripts/init-artifact.sh`
2. Develop your artifact by editing the generated code
3. Bundle all code into a single HTML file using `scripts/bundle-artifact.sh`
4. Display artifact to user
5. (Optional) Test the artifact

**Stack**: React 18 + TypeScript + Vite + Parcel (bundling) + Tailwind CSS + shadcn/ui

## Design & Style Guidelines

To avoid "AI slop", avoid excessive centered layouts, purple gradients, uniform rounded corners, and Inter font. Aim for distinctive, intentional design choices.

## Quick Start

### Step 1: Initialize Project

```bash
bash scripts/init-artifact.sh <project-name>
cd <project-name>
```

This creates a fully configured project with:
- React + TypeScript (via Vite)
- Tailwind CSS 3.4.1 with shadcn/ui theming system
- Path aliases (`@/`) configured
- 40+ shadcn/ui components pre-installed
- All Radix UI dependencies included
- Parcel configured for bundling (via .parcelrc)
- Node 18+ compatibility (auto-detects and pins Vite version)

### Step 2: Develop Your Artifact

Edit the generated files. See **Common Development Tasks** below for guidance.

### Step 3: Bundle to Single HTML File

```bash
bash scripts/bundle-artifact.sh
```

Creates `bundle.html` — a self-contained artifact with all JavaScript, CSS, and dependencies inlined. This file can be shared directly in Claude conversations.

**Requirements**: Project must have `index.html` in root.

**What the script does**: Installs bundling dependencies (parcel, @parcel/config-default, parcel-resolver-tspaths, html-inline), creates `.parcelrc` config, builds with Parcel (no source maps), inlines all assets.

### Step 4: Share Artifact with User

Share the bundled HTML file so they can view it as an artifact.

### Step 5: Testing (Optional)

Only test if necessary or requested. Use available tools (other Skills, Playwright, Puppeteer). Avoid upfront testing as it adds latency — test after presenting if issues arise.

## Reference

- **shadcn/ui components**: https://ui.shadcn.com/docs/components

## Examples

**Example 1: Interactive dashboard**
User says: "Build me a project management dashboard with kanban boards and analytics"
→ Initialize project, create components for KanbanBoard, AnalyticsPanel, use shadcn/ui Card, Dialog, Tabs. Add state management with React hooks. Bundle and present.

**Example 2: Multi-page tool**
User says: "Create a design system documentation viewer with component previews"
→ Initialize project, set up routing between pages, use shadcn/ui components for navigation and code display. Build component preview system with live examples. Bundle and present.

**Example 3: Complex form wizard**
User says: "I need a multi-step onboarding form with validation and progress tracking"
→ Initialize project, create StepWizard component with form validation, use shadcn/ui Form, Input, Select, Progress. Manage form state across steps. Bundle and present.

## Common Issues

- **Bundle fails**: Ensure `index.html` exists in root. Check that all imports resolve correctly — Parcel will error on missing modules.
- **shadcn/ui components not found**: All 40+ components are pre-installed by `init-artifact.sh`. If one is missing, check the import path uses `@/components/ui/`.
- **Styles not applying**: Verify Tailwind CSS is configured and `@tailwind` directives are in the CSS entry point.
- **Large bundle size**: For simpler needs, consider whether a single-file HTML/JSX artifact would suffice (this skill is for complex, multi-component projects).
- **Node version issues**: The init script auto-detects Node 18+ and pins Vite version accordingly. If issues persist, check `node --version`.
