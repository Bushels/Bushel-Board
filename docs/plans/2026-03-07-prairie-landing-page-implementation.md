# Prairie Landing Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current landing page particle background with an immersive golden-hour prairie landscape — animated wheat field, rolling hills, sunset sky — all in Canvas 2D.

**Architecture:** Single `PrairieScene` component replaces `GrainParticles` on the landing page. The scene is rendered in a full-viewport `<canvas>` element using `requestAnimationFrame`. Wheat stalks use simplex noise for organic wind physics. Content overlay (hero text, CTA, feature cards) remains as DOM elements above the canvas.

**Tech Stack:** React 19, Canvas 2D API, Framer Motion (existing), TypeScript, Tailwind CSS v4

**Design Doc:** `docs/plans/2026-03-07-prairie-landing-page-design.md`

---

### Task 1: Simplex Noise Utility

**Files:**
- Create: `components/ui/prairie-scene/noise.ts`

**Step 1: Create the simplex noise module**

This is a minimal 2D simplex noise implementation used for wind physics. No external dependency needed.

```typescript
// components/ui/prairie-scene/noise.ts

// Minimal 2D simplex noise — adapted from Stefan Gustavson's public domain implementation
// Returns values in [-1, 1] given (x, y) coordinates

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

const grad3 = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [0, 1], [0, -1],
];

// Permutation table (256 entries, doubled to avoid wrapping)
const perm = new Uint8Array(512);
const permMod8 = new Uint8Array(512);

// Seed with deterministic shuffle
(function seed() {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  // Fisher-Yates with fixed seed
  let s = 42;
  for (let i = 255; i > 0; i--) {
    s = (s * 16807 + 0) % 2147483647;
    const j = s % (i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) {
    perm[i] = p[i & 255];
    permMod8[i] = perm[i] % 8;
  }
})();

function dot2(g: number[], x: number, y: number) {
  return g[0] * x + g[1] * y;
}

export function noise2D(x: number, y: number): number {
  const s = (x + y) * F2;
  const i = Math.floor(x + s);
  const j = Math.floor(y + s);
  const t = (i + j) * G2;
  const X0 = i - t;
  const Y0 = j - t;
  const x0 = x - X0;
  const y0 = y - Y0;

  const i1 = x0 > y0 ? 1 : 0;
  const j1 = x0 > y0 ? 0 : 1;

  const x1 = x0 - i1 + G2;
  const y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + 2 * G2;
  const y2 = y0 - 1 + 2 * G2;

  const ii = i & 255;
  const jj = j & 255;

  let n0 = 0, n1 = 0, n2 = 0;

  let t0 = 0.5 - x0 * x0 - y0 * y0;
  if (t0 >= 0) {
    t0 *= t0;
    n0 = t0 * t0 * dot2(grad3[permMod8[ii + perm[jj]]], x0, y0);
  }

  let t1 = 0.5 - x1 * x1 - y1 * y1;
  if (t1 >= 0) {
    t1 *= t1;
    n1 = t1 * t1 * dot2(grad3[permMod8[ii + i1 + perm[jj + j1]]], x1, y1);
  }

  let t2 = 0.5 - x2 * x2 - y2 * y2;
  if (t2 >= 0) {
    t2 *= t2;
    n2 = t2 * t2 * dot2(grad3[permMod8[ii + 1 + perm[jj + 1]]], x2, y2);
  }

  return 70 * (n0 + n1 + n2);
}
```

**Step 2: Commit**

```bash
git add components/ui/prairie-scene/noise.ts
git commit -m "feat: add simplex noise utility for prairie wind physics"
```

---

### Task 2: Sky & Sun Rendering

**Files:**
- Create: `components/ui/prairie-scene/sky.ts`

**Step 1: Create the sky renderer**

Renders the golden-hour sky gradient, sun disc with glow, and drifting cloud wisps.

```typescript
// components/ui/prairie-scene/sky.ts

interface SkyConfig {
  isDark: boolean;
}

export function drawSky(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  horizonY: number,
  time: number,
  config: SkyConfig
) {
  // Sky gradient
  const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
  if (config.isDark) {
    skyGrad.addColorStop(0, "#0f1133");     // deep indigo at zenith
    skyGrad.addColorStop(0.5, "#1a1a3e");   // mid indigo
    skyGrad.addColorStop(0.85, "#4a2040");  // deep purple-red
    skyGrad.addColorStop(1, "#c2570a");     // burnt orange at horizon
  } else {
    skyGrad.addColorStop(0, "#5b8cb8");     // soft blue at zenith
    skyGrad.addColorStop(0.4, "#d4a574");   // warm peach
    skyGrad.addColorStop(0.75, "#e8a84c");  // amber
    skyGrad.addColorStop(1, "#d4781e");     // deep amber at horizon
  }
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, w, horizonY + 20);

  // Sun disc
  const sunX = w * 0.65;
  const sunY = horizonY - h * 0.02;
  const sunRadius = Math.min(w, h) * 0.06;

  // Sun glow (radial gradient)
  const glowRadius = sunRadius * 4;
  const glow = ctx.createRadialGradient(sunX, sunY, sunRadius * 0.3, sunX, sunY, glowRadius);
  if (config.isDark) {
    glow.addColorStop(0, "rgba(210, 120, 40, 0.6)");
    glow.addColorStop(0.3, "rgba(210, 100, 20, 0.2)");
    glow.addColorStop(1, "rgba(210, 80, 10, 0)");
  } else {
    glow.addColorStop(0, "rgba(255, 220, 120, 0.8)");
    glow.addColorStop(0.3, "rgba(255, 200, 80, 0.3)");
    glow.addColorStop(1, "rgba(255, 180, 60, 0)");
  }
  ctx.fillStyle = glow;
  ctx.fillRect(sunX - glowRadius, sunY - glowRadius, glowRadius * 2, glowRadius * 2);

  // Sun disc itself
  const sunGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunRadius);
  if (config.isDark) {
    sunGrad.addColorStop(0, "#e8931e");
    sunGrad.addColorStop(0.7, "#d4781e");
    sunGrad.addColorStop(1, "rgba(200, 100, 20, 0.2)");
  } else {
    sunGrad.addColorStop(0, "#fff5d4");
    sunGrad.addColorStop(0.5, "#ffe088");
    sunGrad.addColorStop(1, "rgba(255, 200, 80, 0.1)");
  }
  ctx.fillStyle = sunGrad;
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
  ctx.fill();

  // Cloud wisps (2-3 drifting slowly)
  drawClouds(ctx, w, horizonY, time, config);
}

function drawClouds(
  ctx: CanvasRenderingContext2D,
  w: number,
  horizonY: number,
  time: number,
  config: SkyConfig
) {
  const cloudColor = config.isDark
    ? "rgba(80, 60, 100, 0.15)"
    : "rgba(255, 240, 220, 0.25)";

  ctx.fillStyle = cloudColor;

  // Each cloud: horizontal ellipse drifting with time
  const clouds = [
    { baseX: w * 0.2, y: horizonY * 0.2, rx: 80, ry: 12, speed: 0.008 },
    { baseX: w * 0.6, y: horizonY * 0.35, rx: 100, ry: 10, speed: 0.005 },
    { baseX: w * 0.85, y: horizonY * 0.15, rx: 60, ry: 8, speed: 0.01 },
  ];

  for (const c of clouds) {
    const x = ((c.baseX + time * c.speed * w) % (w + c.rx * 4)) - c.rx * 2;
    ctx.beginPath();
    ctx.ellipse(x, c.y, c.rx, c.ry, 0, 0, Math.PI * 2);
    ctx.fill();
    // Second smaller ellipse offset for wispy look
    ctx.beginPath();
    ctx.ellipse(x + c.rx * 0.4, c.y - c.ry * 0.5, c.rx * 0.6, c.ry * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}
```

**Step 2: Commit**

```bash
git add components/ui/prairie-scene/sky.ts
git commit -m "feat: add sky gradient, sun disc, and cloud rendering"
```

---

### Task 3: Rolling Hills

**Files:**
- Create: `components/ui/prairie-scene/hills.ts`

**Step 1: Create the hills renderer**

Renders 3 layers of rolling hills with parallax mouse offset. Back hills are darker/more muted.

```typescript
// components/ui/prairie-scene/hills.ts

interface HillsConfig {
  isDark: boolean;
}

export function drawHills(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  horizonY: number,
  mouseOffsetX: number,
  config: HillsConfig
) {
  const hills = [
    {
      // Distant hills — darkest, least parallax
      color: config.isDark ? "rgba(25, 25, 40, 0.9)" : "rgba(120, 100, 70, 0.3)",
      yOffset: 0,
      parallax: 0.005,
      amplitude: h * 0.04,
      frequency: 0.0015,
    },
    {
      // Mid hills
      color: config.isDark ? "rgba(30, 28, 35, 0.85)" : "rgba(140, 115, 75, 0.35)",
      yOffset: h * 0.015,
      parallax: 0.01,
      amplitude: h * 0.035,
      frequency: 0.002,
    },
    {
      // Near hills — most color, most parallax
      color: config.isDark ? "rgba(35, 32, 28, 0.8)" : "rgba(160, 135, 85, 0.4)",
      yOffset: h * 0.03,
      parallax: 0.02,
      amplitude: h * 0.03,
      frequency: 0.003,
    },
  ];

  for (const hill of hills) {
    const px = mouseOffsetX * hill.parallax;
    ctx.fillStyle = hill.color;
    ctx.beginPath();
    ctx.moveTo(0, h);

    for (let x = 0; x <= w; x += 4) {
      const y =
        horizonY +
        hill.yOffset +
        Math.sin((x + px) * hill.frequency) * hill.amplitude +
        Math.sin((x + px) * hill.frequency * 2.3 + 1.5) * hill.amplitude * 0.4;
      ctx.lineTo(x, y);
    }

    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  }
}
```

**Step 2: Commit**

```bash
git add components/ui/prairie-scene/hills.ts
git commit -m "feat: add rolling hills with parallax effect"
```

---

### Task 4: Wheat Stalk Class

**Files:**
- Create: `components/ui/prairie-scene/wheat.ts`

**Step 1: Create the wheat stalk data structure and renderer**

Each wheat stalk is a bezier curve with a head (elongated oval). Wind sway is driven by simplex noise. Mouse proximity causes stalks to lean away.

```typescript
// components/ui/prairie-scene/wheat.ts

import { noise2D } from "./noise";

const WHEAT_COLORS = ["#D4A017", "#B8860B", "#F3E5AB", "#DAA520", "#C5922A"];
const WHEAT_COLORS_DARK = ["#9E7812", "#8B6914", "#C9A84E", "#A07818", "#957020"];

export class WheatStalk {
  x: number;         // base x position
  baseY: number;     // ground level y
  height: number;    // stalk height in px
  color: string;
  colorDark: string;
  phase: number;     // noise phase offset for organic variation
  headDroop: number; // how much the head droops
  thickness: number;

  constructor(x: number, baseY: number, depth: number, canvasH: number) {
    this.x = x;
    this.baseY = baseY;
    // depth 0 = back (shorter), 1 = front (taller)
    const depthScale = 0.5 + depth * 0.5;
    this.height = (40 + Math.random() * 50) * depthScale;
    this.thickness = (0.8 + Math.random() * 0.8) * depthScale;
    this.phase = Math.random() * 1000;
    this.headDroop = 4 + Math.random() * 6;

    const colorIdx = Math.floor(Math.random() * WHEAT_COLORS.length);
    this.color = WHEAT_COLORS[colorIdx];
    this.colorDark = WHEAT_COLORS_DARK[colorIdx];
  }

  draw(
    ctx: CanvasRenderingContext2D,
    time: number,
    gustTime: number,
    mouseX: number,
    mouseY: number,
    isDark: boolean
  ) {
    // Wind sway from simplex noise
    const noiseVal = noise2D(this.x * 0.005 + this.phase, time * 0.4);
    // Gust: stronger wave that travels left-to-right
    const gustWave = Math.sin(this.x * 0.003 - gustTime * 2) * 0.5 + 0.5;
    const gustStrength = Math.max(0, Math.sin(gustTime * 0.8)) * gustWave;
    const sway = noiseVal * 12 + gustStrength * 18;

    // Mouse parting — stalks lean away from cursor
    const dx = this.x - mouseX;
    const dy = this.baseY - mouseY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const mouseRadius = 100;
    let mousePush = 0;
    if (dist < mouseRadius && dist > 0) {
      const force = (1 - dist / mouseRadius) * 25;
      mousePush = dx > 0 ? force : -force;
    }

    const totalSway = sway + mousePush;

    // Draw stem as quadratic bezier
    const tipX = this.x + totalSway;
    const tipY = this.baseY - this.height;
    const cpX = this.x + totalSway * 0.5;
    const cpY = this.baseY - this.height * 0.6;

    ctx.strokeStyle = isDark ? this.colorDark : this.color;
    ctx.lineWidth = this.thickness;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(this.x, this.baseY);
    ctx.quadraticCurveTo(cpX, cpY, tipX, tipY);
    ctx.stroke();

    // Draw wheat head — small elongated ellipse at tip, drooping
    const headX = tipX + totalSway * 0.15;
    const headY = tipY + this.headDroop * 0.3;
    const headAngle = Math.atan2(this.headDroop, totalSway * 0.15) - Math.PI / 2;
    const headLength = 5 + this.height * 0.06;
    const headWidth = 1.5 + this.thickness * 0.5;

    ctx.fillStyle = isDark ? this.colorDark : this.color;
    ctx.save();
    ctx.translate(headX, headY);
    ctx.rotate(headAngle + totalSway * 0.01);
    ctx.beginPath();
    ctx.ellipse(0, 0, headWidth, headLength, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export function createWheatField(
  canvasW: number,
  canvasH: number,
  horizonY: number
): WheatStalk[] {
  const stalks: WheatStalk[] = [];
  const fieldTop = horizonY + canvasH * 0.03; // just below hills
  const fieldBottom = canvasH;
  const count = Math.floor(canvasW / 5); // ~200-400 based on width

  for (let i = 0; i < count; i++) {
    const x = Math.random() * canvasW;
    const depth = Math.random(); // 0 = back, 1 = front
    const baseY = fieldTop + depth * (fieldBottom - fieldTop);
    stalks.push(new WheatStalk(x, baseY, depth, canvasH));
  }

  // Sort by depth so back stalks draw first (painter's algorithm)
  stalks.sort((a, b) => a.baseY - b.baseY);

  return stalks;
}
```

**Step 2: Commit**

```bash
git add components/ui/prairie-scene/wheat.ts
git commit -m "feat: add wheat stalk class with wind physics and mouse interaction"
```

---

### Task 5: Floating Particles (Simplified)

**Files:**
- Create: `components/ui/prairie-scene/particles.ts`

**Step 1: Create the simplified particle system**

Lighter version of existing GrainParticles — gold-only, fewer count, drifting above the field.

```typescript
// components/ui/prairie-scene/particles.ts

const GOLD_COLORS = ["#D4A017", "#F3E5AB", "#E5C77F", "#DAA520"];

export class GrainMote {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  size: number;
  speedX: number;
  speedY: number;
  color: string;
  opacity: number;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.baseX = x;
    this.baseY = y;
    this.size = Math.random() * 2 + 0.5;
    this.speedX = (Math.random() - 0.5) * 0.2;
    this.speedY = (Math.random() - 0.5) * 0.15;
    this.color = GOLD_COLORS[Math.floor(Math.random() * GOLD_COLORS.length)];
    this.opacity = 0.3 + Math.random() * 0.4;
  }

  update() {
    this.x += this.speedX;
    this.y += this.speedY;

    // Drift back toward base
    if (Math.abs(this.x - this.baseX) > 60) this.speedX *= -1;
    if (Math.abs(this.y - this.baseY) > 40) this.speedY *= -1;
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.globalAlpha = this.opacity;
    ctx.fillStyle = this.color;
    ctx.shadowBlur = 6;
    ctx.shadowColor = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }
}

export function createMotes(
  canvasW: number,
  horizonY: number,
  count: number = 40
): GrainMote[] {
  const motes: GrainMote[] = [];
  for (let i = 0; i < count; i++) {
    // Scatter above the wheat field — between top of field and mid-sky
    const x = Math.random() * canvasW;
    const y = horizonY * 0.3 + Math.random() * horizonY * 0.8;
    motes.push(new GrainMote(x, y));
  }
  return motes;
}
```

**Step 2: Commit**

```bash
git add components/ui/prairie-scene/particles.ts
git commit -m "feat: add simplified gold grain mote particles"
```

---

### Task 6: PrairieScene Component — Assemble & Animate

**Files:**
- Create: `components/ui/prairie-scene/index.tsx`

**Step 1: Create the main PrairieScene component**

Assembles all layers into a single canvas with `requestAnimationFrame` loop, mouse tracking, resize handling, and reduced motion support.

```typescript
// components/ui/prairie-scene/index.tsx
"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { drawSky } from "./sky";
import { drawHills } from "./hills";
import { WheatStalk, createWheatField } from "./wheat";
import { GrainMote, createMotes } from "./particles";

export function PrairieScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Check reduced motion preference
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    // Detect dark mode
    const isDark = () => document.documentElement.classList.contains("dark");

    let animationFrameId: number;
    let stalks: WheatStalk[] = [];
    let motes: GrainMote[] = [];
    let time = 0;
    let gustTime = 0;

    const mouse = { x: -1000, y: -1000 };

    function resize() {
      canvas!.width = window.innerWidth;
      canvas!.height = window.innerHeight;
      const horizonY = canvas!.height * 0.55;
      stalks = createWheatField(canvas!.width, canvas!.height, horizonY);
      motes = createMotes(canvas!.width, horizonY, 40);
    }

    const handleMouseMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };
    const handleMouseOut = () => {
      mouse.x = -1000;
      mouse.y = -1000;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseout", handleMouseOut);
    window.addEventListener("resize", resize);

    resize();

    if (prefersReducedMotion) {
      // Draw a single static frame
      const horizonY = canvas.height * 0.55;
      const dark = isDark();
      drawSky(ctx, canvas.width, canvas.height, horizonY, 0, { isDark: dark });
      drawHills(ctx, canvas.width, canvas.height, horizonY, 0, { isDark: dark });
      // Draw stalks with no sway (time=0, gustTime=0, mouse offscreen)
      for (const stalk of stalks) {
        stalk.draw(ctx, 0, 0, -1000, -1000, dark);
      }
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseout", handleMouseOut);
        window.removeEventListener("resize", resize);
      };
    }

    function animate() {
      const w = canvas!.width;
      const h = canvas!.height;
      const horizonY = h * 0.55;
      const dark = isDark();

      ctx!.clearRect(0, 0, w, h);

      // Layer 1: Sky
      drawSky(ctx!, w, h, horizonY, time, { isDark: dark });

      // Layer 2: Hills (with mouse parallax)
      const mouseOffsetX = (mouse.x - w / 2);
      drawHills(ctx!, w, h, horizonY, mouseOffsetX, { isDark: dark });

      // Ground fill below hills
      const groundGrad = ctx!.createLinearGradient(0, horizonY + h * 0.05, 0, h);
      if (dark) {
        groundGrad.addColorStop(0, "#2a2218");
        groundGrad.addColorStop(1, "#1a1610");
      } else {
        groundGrad.addColorStop(0, "#c5a55a");
        groundGrad.addColorStop(1, "#a08840");
      }
      ctx!.fillStyle = groundGrad;
      ctx!.fillRect(0, horizonY + h * 0.03, w, h - horizonY);

      // Layer 3: Wheat stalks
      for (const stalk of stalks) {
        stalk.draw(ctx!, time, gustTime, mouse.x, mouse.y, dark);
      }

      // Layer 4: Floating motes
      for (const mote of motes) {
        mote.update();
        mote.draw(ctx!);
      }

      time += 0.016; // ~60fps time step
      gustTime += 0.016;

      animationFrameId = requestAnimationFrame(animate);
    }

    animate();

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseout", handleMouseOut);
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <motion.canvas
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1.5 }}
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
}
```

**Step 2: Verify it builds**

Run: `cd ../bushel-board-app && npm run build`
Expected: No TypeScript errors from the new component.

**Step 3: Commit**

```bash
git add components/ui/prairie-scene/index.tsx
git commit -m "feat: assemble PrairieScene component with all layers"
```

---

### Task 7: Update Landing Page

**Files:**
- Modify: `app/page.tsx`

**Step 1: Replace GrainParticles with PrairieScene and update hero styling**

The hero text needs white/light colors with text-shadow for readability over the scene. Logo reduced to 120px. CTA gets canola gold styling. Add a scroll-down chevron.

Replace the full content of `app/page.tsx`:

```typescript
"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BarChart3, Database, ClipboardList, ChevronDown } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { PrairieScene } from "@/components/ui/prairie-scene";
import { motion } from "framer-motion";

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    async function checkUser() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        router.push("/overview");
      }
    }
    checkUser();
  }, [router]);

  return (
    <div className="relative min-h-screen overflow-hidden font-sans">
      {/* Prairie Background */}
      <PrairieScene />

      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative z-10 mx-auto max-w-6xl px-6 py-6 flex items-center justify-end"
      >
        <Link href="/login">
          <Button
            variant="outline"
            className="bg-white/20 border-white/30 hover:bg-white/40 text-white shadow-sm backdrop-blur-sm rounded-full px-6"
          >
            Sign In
          </Button>
        </Link>
      </motion.header>

      {/* Hero — overlaid on the prairie scene */}
      <main className="relative z-10 mx-auto max-w-4xl px-4 pt-4 pb-20 text-center space-y-6 min-h-[70vh] flex flex-col items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.1, ease: "easeOut" }}
          className="flex justify-center mb-6"
        >
          <Logo size={120} />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3, ease: "easeOut" }}
          className="text-5xl sm:text-7xl font-display font-black leading-[1.1] text-white tracking-tight"
          style={{ textShadow: "0 2px 20px rgba(0,0,0,0.3)" }}
        >
          Deliver <br />
          <span className="text-canola" style={{ textShadow: "0 2px 20px rgba(0,0,0,0.2)" }}>
            with Data.
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.4, ease: "easeOut" }}
          className="text-lg text-white/80 max-w-2xl mx-auto leading-relaxed"
          style={{ textShadow: "0 1px 10px rgba(0,0,0,0.3)" }}
        >
          Harness your farm&apos;s production metrics to uncover clear insights.
          Make confident, well-timed decisions on when to hold and when to sell
          your grain.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.5, ease: "easeOut" }}
          className="flex flex-col items-center gap-5 pt-6"
        >
          <Link href="/signup">
            <Button
              size="lg"
              className="bg-canola hover:bg-canola-dark text-white px-10 py-6 text-lg rounded-full shadow-[0_4px_24px_rgba(193,127,36,0.4)] transition-all hover:-translate-y-1"
            >
              Get Started
            </Button>
          </Link>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1.2 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
        >
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          >
            <ChevronDown className="h-6 w-6 text-white/50" />
          </motion.div>
        </motion.div>
      </main>

      {/* Features — below the fold */}
      <section className="relative z-10 mx-auto max-w-5xl px-4 py-16 pb-32 bg-wheat-50 dark:bg-wheat-900">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          <FeatureBlock
            icon={<Database className="h-7 w-7 text-canola" />}
            title="Track Inventory"
            description="Quietly log your acreage, harvests, and contracts to build a private, comprehensive view of your entire operation."
            delay={0.2}
          />
          <FeatureBlock
            icon={<ClipboardList className="h-7 w-7 text-canola" />}
            title="Analyze Margins"
            description="Understand your delivery pace, progress, and exact profitability margins at a glance with clear, actionable visuals."
            delay={0.3}
          />
          <FeatureBlock
            icon={<BarChart3 className="h-7 w-7 text-canola" />}
            title="Sell with Confidence"
            description="Use your localized numbers to make perfectly timed sales decisions, minimizing risk and maximizing your farm's revenue."
            delay={0.4}
          />
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 py-12 text-center text-sm text-wheat-400 bg-wheat-50 dark:bg-wheat-900">
        <p>&copy; {new Date().getFullYear()} Bushel Board.</p>
      </footer>
    </div>
  );
}

function FeatureBlock({
  icon,
  title,
  description,
  delay,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.6, delay, ease: "easeOut" }}
      className="p-8 rounded-[2rem] bg-white dark:bg-wheat-800 border border-wheat-100 dark:border-wheat-700 shadow-sm hover:shadow-xl transition-all duration-300 text-left space-y-5"
    >
      <div className="inline-flex p-4 rounded-xl bg-wheat-50 dark:bg-wheat-700 border border-wheat-100 dark:border-wheat-600">
        {icon}
      </div>
      <h3 className="font-display text-xl font-bold text-wheat-900 dark:text-wheat-100">
        {title}
      </h3>
      <p className="text-wheat-500 dark:text-wheat-300 leading-relaxed text-base">
        {description}
      </p>
    </motion.div>
  );
}
```

Key changes from the original:
- `GrainParticles` → `PrairieScene`
- Background removed from container (canvas IS the background)
- Hero text: white with `textShadow` for readability
- Logo: 240px → 120px
- CTA: canola gold with glow shadow instead of slate
- Sign In button: glass morphism (white/20 bg, white text)
- Feature cards: use `whileInView` instead of timed `animate` (scroll-triggered)
- Feature icons: canola colored instead of slate
- Feature section gets explicit wheat bg to cover the canvas
- Dark mode classes on feature cards and footer
- Animated scroll-down chevron at bottom of hero
- Feature card delays reduced (they trigger on scroll now)

**Step 2: Run the dev server and visually verify**

Run: `cd ../bushel-board-app && npm run dev`

Check:
- Prairie scene renders as full-bleed background
- Wheat stalks sway with wind
- Mouse moves near wheat → stalks part
- Text is readable (white on scene)
- Scroll down → feature cards appear
- Dark mode toggle → dusk palette
- Resize → scene adjusts

**Step 3: Run build to verify no type errors**

Run: `npm run build`
Expected: Build succeeds with no errors.

**Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "feat: integrate PrairieScene into landing page with updated hero styling"
```

---

### Task 8: Visual Polish & Tuning

**Files:**
- Modify: `components/ui/prairie-scene/sky.ts` (if sky colors need adjustment)
- Modify: `components/ui/prairie-scene/wheat.ts` (if stalk count/physics need tuning)
- Modify: `components/ui/prairie-scene/index.tsx` (if timing needs adjustment)
- Modify: `app/page.tsx` (if text contrast needs work)

**Step 1: Run dev server and tune parameters**

Run: `cd ../bushel-board-app && npm run dev`

Tuning checklist:
- [ ] Horizon line position (currently 55% from top — adjust if text overlaps wheat)
- [ ] Wheat stalk density (currently `canvasW / 5` — increase/decrease for visual balance)
- [ ] Wind sway amplitude (currently 12px noise + 18px gust — adjust for subtlety)
- [ ] Gust frequency (every ~3-5s via `Math.sin(gustTime * 0.8)`)
- [ ] Sun position and glow intensity
- [ ] Cloud drift speed
- [ ] Mouse interaction radius (currently 100px — adjust feel)
- [ ] Text shadow strength for readability
- [ ] Feature section transition (clean edge between scene and cards)
- [ ] Performance: should maintain 60fps

**Step 2: Commit any adjustments**

```bash
git add -A
git commit -m "chore: tune prairie scene visual parameters"
```

---

### Task 9: Final Build & Verification

**Files:**
- No new files

**Step 1: Run production build**

Run: `cd ../bushel-board-app && npm run build`
Expected: Build succeeds, no errors or warnings.

**Step 2: Verify accessibility**

- Canvas has `aria-hidden="true"`
- All interactive elements (buttons, links) are in DOM above canvas
- `prefers-reduced-motion` shows static frame
- CTA contrast meets WCAG AA

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: prairie landing page complete — golden hour animated scene"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Simplex noise utility | `prairie-scene/noise.ts` |
| 2 | Sky & sun rendering | `prairie-scene/sky.ts` |
| 3 | Rolling hills with parallax | `prairie-scene/hills.ts` |
| 4 | Wheat stalk class with wind physics | `prairie-scene/wheat.ts` |
| 5 | Floating gold particles | `prairie-scene/particles.ts` |
| 6 | PrairieScene component (assembles all layers) | `prairie-scene/index.tsx` |
| 7 | Update landing page to use PrairieScene | `app/page.tsx` |
| 8 | Visual polish & parameter tuning | Various |
| 9 | Final build & verification | — |

All files live in `components/ui/prairie-scene/` except the landing page at `app/page.tsx`. Zero new dependencies.
