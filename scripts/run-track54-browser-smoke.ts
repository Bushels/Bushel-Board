#!/usr/bin/env npx tsx
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:net";
import { pathToFileURL } from "node:url";
import {
  PUBLIC_ADVICE_FORBIDDEN_TERMS,
  PUBLIC_BOARD_FORBIDDEN_TERMS,
  publicForbiddenTermPatternSpecs,
} from "../lib/public-copy-guardrails";

interface RouteSmokeConfig {
  path: string;
  markers: string[];
  forbiddenText: string[];
}

export interface ViewportConfig {
  name: "desktop" | "mobile";
  width: number;
  height: number;
  mobile: boolean;
}

export interface BrowserSmokeProof {
  schema_version: "track54_browser_smoke_proof_v1";
  generated_at: string;
  command: string;
  checked: boolean;
  ok: boolean;
  output: string[];
}

export interface PageState {
  href: string;
  title: string;
  markerHits: Array<{ marker: string; present: boolean }>;
  visibleMarkerHits: Array<{ marker: string; present: boolean; visible: boolean; unobscured: boolean }>;
  forbiddenHits: string[];
  hasErrorOverlay: boolean;
  bodyLength: number;
}

export interface InteractionResult {
  name: string;
  ok: boolean;
  detail: string;
}

export interface RouteSmokeResult {
  route: string;
  viewport: ViewportConfig["name"];
  url: string;
  state: PageState;
  interaction: InteractionResult;
  errors: string[];
  screenshot_path: string;
  screenshot_bytes: number;
  screenshot_dimensions: {
    width: number;
    height: number;
  };
  screenshot_visual: ScreenshotVisualStats;
}

export interface ScreenshotVisualStats {
  sample_pixels: number;
  distinct_colors: number;
  non_white_ratio: number;
  luma_range: number;
}

const args = process.argv.slice(2);
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const MIN_SCREENSHOT_BYTES = 2_048;
const MIN_SCREENSHOT_VISUAL_DISTINCT_COLORS = 8;
const MIN_SCREENSHOT_VISUAL_NON_WHITE_RATIO = 0.005;
const MIN_SCREENSHOT_VISUAL_LUMA_RANGE = 16;

function hasPngSignature(buffer: Buffer): boolean {
  return PNG_SIGNATURE.every((byte, index) => buffer[index] === byte);
}

function pngDimensions(buffer: Buffer): { width: number; height: number } | undefined {
  if (!hasPngSignature(buffer) || buffer.length < 24) return undefined;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function optionValue(flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index !== -1) return args[index + 1];
  const inline = args.find((arg) => arg.startsWith(`${flag}=`));
  return inline ? inline.slice(flag.length + 1) : undefined;
}

function hasFlag(flag: string): boolean {
  return args.includes(flag);
}

if (hasFlag("--help") || hasFlag("-h")) {
  console.error(`
Track 54 Browser Smoke

Usage:
  npm run track54:browser-smoke
  npm run track54:browser-smoke -- --base-url http://127.0.0.1:3110
  npm run track54:browser-smoke -- --out scratch/track54-browser-smoke/browser-smoke-proof.json

Options:
  --base-url <url>       Local app URL. Default: http://127.0.0.1:3110.
  --out <path>           Proof JSON path. Default: scratch/track54-browser-smoke/browser-smoke-proof.json.
  --chrome-path <path>   Chrome or Edge executable path.
  --settle-ms <number>   Extra wait after load before collecting logs. Default: 1200.
  --viewport <mode>      desktop, mobile, or both. Default: both.
  --no-start-server      Fail if --base-url is not already reachable.
`);
  process.exit(0);
}

const VIEWPORTS: Record<ViewportConfig["name"], ViewportConfig> = {
  desktop: { name: "desktop", width: 1024, height: 768, mobile: false },
  mobile: { name: "mobile", width: 375, height: 812, mobile: true },
};

const ROUTES: RouteSmokeConfig[] = [
  {
    // Wheat-first board (2026-06-24): normal /thesis leads with one Wheat
    // Bull/Bear read and keeps only farmer-facing surfaces. Operator telemetry
    // markers are forbidden here and must render in audit mode instead.
    path: "/thesis",
    markers: [
      "Current stance",
      "Thesis confidence",
      "Crop progress",
      "Prairie + US condition",
      "MB · SK · AB this week",
      "Canada Prairie",
      "Prairie map",
      "Satellite moisture",
      "Crop-stress belts",
      "Stress thumbnail",
      "Price proof",
      "Spring · HRW · SRW",
      "Agreement motion",
      "Evidence cross-check",
      "Relationship spiderweb",
      "Source (what we watch)",
      "Price basket proof",
      "Packet trend context",
      "Historical price context",
      "Historical export context",
      "USDA relationship read",
      "Decision role",
      "Wheat Crop Progress",
      "What feeds this read",
      "Watch leads (what could change the thesis)",
      "Read the evidence",
      "Your area",
      "Source health",
      "Board update mode",
      "Score source",
      "Wheat Pressure Map",
      "Source data lanes",
      "Wheat factor nodes",
      "Packet contributions",
      "Current packet contribution",
    ],
    // "Watch-only social evidence" is the moved X Pulse panel's badge; the panel title
    // "X Pulse Watch" cannot be used as a sentinel because it case-insensitively matches
    // the legitimate "X Pulse watch leads" copy in the farmer-facing pressure map.
    forbiddenText: [
      ...PUBLIC_BOARD_FORBIDDEN_TERMS,
      "All Grains at a Glance",
      "Major Grain Thesis Matrix",
      "Canada Major Grains",
      "US Markets",
      "Daily automation gate progress",
      "Weekly Data Intake",
      "Readiness proof",
      "Track 54 production gate",
      "Watch-only social evidence",
    ],
  },
  {
    path: "/thesis?audit=1",
    markers: [
      "Current stance",
      "Thesis confidence",
      "Crop progress",
      "Prairie + US condition",
      "Prairie map",
      "Satellite moisture",
      "Stress thumbnail",
      "Price proof",
      "Agreement motion",
      "Evidence cross-check",
      "Relationship spiderweb",
      "Source health",
      "Price basket proof",
      "Packet trend context",
      "Historical price context",
      "Historical export context",
      "USDA relationship read",
      "Decision role",
      "Your area",
      "Board update mode",
      "Daily Update Status",
      "Daily decision path",
      "Today update window",
      "Today update checklist",
      "Daily automation gate progress",
      "Readiness proof",
      "Score source",
      "X Pulse Watch",
      "Weekly Data Intake",
      "Analyzed data",
      "Current week pull tracker",
      "Weekly pull calendar",
      "Track 54 production gate",
      "How data becomes Bull/Bear pressure",
      "Role",
      "Pressure lane",
      "Current board status",
      "Latest collector",
      "Wheat Pressure Map",
      "Source data lanes",
      "Wheat factor nodes",
      "All graph links",
      "Packet contributions",
      "Current packet contribution",
      "Scorecard audit",
      "Data coverage matrix",
      "Next source admissions",
      "Impact Map audit",
    ],
    forbiddenText: [...PUBLIC_ADVICE_FORBIDDEN_TERMS],
  },
];

function findChromePath(): string {
  const explicit = optionValue("--chrome-path");
  if (explicit) return explicit;

  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error("No Chrome or Edge executable found. Pass --chrome-path.");
  }
  return found;
}

function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") resolvePort(address.port);
        else reject(new Error("Unable to allocate a local debugging port"));
      });
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function summarizeRuntimeException(params: any): string {
  const details = params.exceptionDetails ?? {};
  const text = details.text ?? "Runtime exception";
  const exception = details.exception ?? {};
  const description = exception.description ?? exception.value ?? "";
  const locationParts = [
    details.url,
    typeof details.lineNumber === "number" ? `line ${details.lineNumber + 1}` : "",
    typeof details.columnNumber === "number" ? `col ${details.columnNumber + 1}` : "",
  ].filter(Boolean);
  const firstFrame = details.stackTrace?.callFrames?.[0];
  const frame = firstFrame
    ? [
      firstFrame.functionName || "(anonymous)",
      firstFrame.url,
      typeof firstFrame.lineNumber === "number" ? `line ${firstFrame.lineNumber + 1}` : "",
      typeof firstFrame.columnNumber === "number" ? `col ${firstFrame.columnNumber + 1}` : "",
    ].filter(Boolean).join(" ")
    : "";
  return [
    `exception: ${text}`,
    description ? `description: ${description}` : "",
    locationParts.length > 0 ? `location: ${locationParts.join(" ")}` : "",
    frame ? `frame: ${frame}` : "",
  ].filter(Boolean).join(" | ");
}

async function fetchJson(url: string, init?: RequestInit): Promise<any> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`${init?.method ?? "GET"} ${url} failed with HTTP ${response.status}`);
  }
  return response.json();
}

async function baseUrlReachable(baseUrl: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    await fetch(baseUrl, { signal: controller.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function localNextStartConfig(baseUrl: string): { host: string; port: string } | null {
  const parsed = new URL(baseUrl);
  if (parsed.protocol !== "http:") return null;
  if (!["127.0.0.1", "localhost"].includes(parsed.hostname)) return null;
  return {
    host: parsed.hostname,
    port: parsed.port || "3000",
  };
}

function captureChildOutput(
  child: ChildProcess,
  maxLines = 30,
): () => string {
  const lines: string[] = [];
  const append = (source: "stdout" | "stderr", chunk: Buffer) => {
    for (const line of chunk.toString("utf-8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed) lines.push(`${source}: ${trimmed}`);
    }
    if (lines.length > maxLines) lines.splice(0, lines.length - maxLines);
  };

  child.stdout?.on("data", (chunk: Buffer) => append("stdout", chunk));
  child.stderr?.on("data", (chunk: Buffer) => append("stderr", chunk));

  return () => lines.join(" | ");
}

async function ensureAppServer(baseUrl: string): Promise<ChildProcess | null> {
  if (await baseUrlReachable(baseUrl)) return null;
  if (hasFlag("--no-start-server")) {
    throw new Error(`${baseUrl} is not reachable and --no-start-server was set`);
  }

  const config = localNextStartConfig(baseUrl);
  if (!config) {
    throw new Error(`${baseUrl} is not reachable and cannot be auto-started as a local Next server`);
  }

  const nextBin = resolve("node_modules", "next", "dist", "bin", "next");
  if (!existsSync(nextBin)) {
    throw new Error("Next.js CLI not found under node_modules; run npm install before browser smoke");
  }

  const appServer = spawn(process.execPath, [
    nextBin,
    "start",
    "-H",
    config.host,
    "-p",
    config.port,
  ], { stdio: ["ignore", "pipe", "pipe"] });
  const nextOutput = captureChildOutput(appServer);

  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (appServer.exitCode !== null) {
      throw new Error(
        `Next server exited before ${baseUrl} became reachable ` +
        `(exit=${appServer.exitCode}). Output: ${nextOutput() || "(no output captured)"}`,
      );
    }
    if (await baseUrlReachable(baseUrl)) return appServer;
    await sleep(500);
  }

  appServer.kill();
  throw new Error(`Timed out waiting for Next server at ${baseUrl}. Output: ${nextOutput() || "(no output captured)"}`);
}

async function waitForChrome(port: number): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      await fetchJson(`http://127.0.0.1:${port}/json/version`);
      return;
    } catch {
      await sleep(250);
    }
  }
  throw new Error("Chrome remote debugging endpoint did not become ready");
}

class CdpClient {
  private nextId = 1;
  private pending = new Map<number, { resolve: (value: any) => void; reject: (reason: Error) => void }>();
  private listeners = new Map<string, Array<(params: any) => void>>();

  private constructor(private readonly socket: WebSocket) {}

  static connect(url: string): Promise<CdpClient> {
    return new Promise((resolveClient, reject) => {
      const socket = new WebSocket(url);
      const client = new CdpClient(socket);
      socket.addEventListener("open", () => resolveClient(client), { once: true });
      socket.addEventListener("error", () => reject(new Error("Failed to connect to Chrome DevTools")), { once: true });
      socket.addEventListener("message", (event) => client.handleMessage(String(event.data)));
    });
  }

  on(method: string, listener: (params: any) => void): void {
    const existing = this.listeners.get(method) ?? [];
    existing.push(listener);
    this.listeners.set(method, existing);
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<any> {
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params });
    return new Promise((resolveSend, reject) => {
      this.pending.set(id, { resolve: resolveSend, reject });
      this.socket.send(payload);
    });
  }

  waitFor(method: string, timeoutMs: number): Promise<any> {
    return new Promise((resolveEvent, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), timeoutMs);
      this.on(method, (params) => {
        clearTimeout(timeout);
        resolveEvent(params);
      });
    });
  }

  close(): void {
    this.socket.close();
  }

  private handleMessage(raw: string): void {
    const message = JSON.parse(raw);
    if (typeof message.id === "number") {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message ?? "Chrome DevTools command failed"));
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    if (message.method) {
      for (const listener of this.listeners.get(message.method) ?? []) {
        listener(message.params);
      }
    }
  }
}

function routeFileStem(routePath: string): string {
  return routePath.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "root";
}

function parseViewportMode(): ViewportConfig[] {
  const mode = (optionValue("--viewport") ?? "both").toLowerCase();
  if (mode === "desktop") return [VIEWPORTS.desktop];
  if (mode === "mobile") return [VIEWPORTS.mobile];
  if (mode === "both") return [VIEWPORTS.desktop, VIEWPORTS.mobile];
  throw new Error(`Unsupported --viewport value "${mode}". Use desktop, mobile, or both.`);
}

async function runThemeToggleInteraction(client: CdpClient): Promise<InteractionResult> {
  const evaluated = await client.send("Runtime.evaluate", {
    expression: `(
      async () => {
        const button = document.querySelector('button[aria-label="Toggle theme"]');
        if (!(button instanceof HTMLElement)) {
          return { name: "theme_toggle", ok: false, detail: "missing Toggle theme button" };
        }

        const before = document.documentElement.classList.contains("dark");
        button.click();
        await new Promise((resolve) => setTimeout(resolve, 100));
        const after = document.documentElement.classList.contains("dark");
        button.click();
        await new Promise((resolve) => setTimeout(resolve, 100));
        const restored = document.documentElement.classList.contains("dark");

        return {
          name: "theme_toggle",
          ok: after !== before && restored === before,
          detail: \`before=\${before ? "dark" : "light"} after=\${after ? "dark" : "light"} restored=\${restored ? "dark" : "light"}\`,
        };
      }
    )()`,
    returnByValue: true,
    awaitPromise: true,
  });
  return evaluated.result.value as InteractionResult;
}

async function runMarkerVisibilityProbe(client: CdpClient, markers: string[]): Promise<PageState["visibleMarkerHits"]> {
  const evaluated = await client.send("Runtime.evaluate", {
    expression: `(
      async () => {
        const markers = ${JSON.stringify(markers)};
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

        function textNodesFor(marker) {
          const lowerMarker = marker.toLowerCase();
          const nodes = [];
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) {
            const node = walker.currentNode;
            if ((node.nodeValue || "").toLowerCase().includes(lowerMarker)) nodes.push(node);
          }
          return nodes;
        }

        function hasVisibleAncestors(element) {
          for (let current = element; current; current = current.parentElement) {
            const style = getComputedStyle(current);
            if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
              return false;
            }
          }
          return true;
        }

        function visibleTextRect(node) {
          const range = document.createRange();
          range.selectNodeContents(node);
          const rects = Array.from(range.getClientRects());
          range.detach();
          return rects.find((rect) =>
            rect.width > 0
            && rect.height > 0
            && rect.bottom > 0
            && rect.right > 0
            && rect.top < window.innerHeight
            && rect.left < window.innerWidth
          ) || null;
        }

        function textRectIsUnobscured(element, rect) {
          const left = Math.max(rect.left, 0);
          const right = Math.min(rect.right, window.innerWidth);
          const top = Math.max(rect.top, 0);
          const bottom = Math.min(rect.bottom, window.innerHeight);
          if (right <= left || bottom <= top) return false;

          const x = (left + right) / 2;
          const y = (top + bottom) / 2;
          const topElement = document.elementFromPoint(x, y);
          return Boolean(topElement && (
            topElement === element
            || element.contains(topElement)
            || topElement.contains(element)
          ));
        }

        const results = [];
        for (const marker of markers) {
          const nodes = textNodesFor(marker);
          let visible = false;
          let unobscured = false;
          for (const node of nodes) {
            const element = node.parentElement;
            if (!element) continue;
            element.scrollIntoView({ block: "center", inline: "nearest" });
            await sleep(15);
            const textRect = visibleTextRect(node);
            if (textRect && hasVisibleAncestors(element)) {
              visible = true;
              unobscured = textRectIsUnobscured(element, textRect);
              if (unobscured) {
                break;
              }
            }
          }
          results.push({ marker, present: nodes.length > 0, visible, unobscured });
        }
        window.scrollTo(0, 0);
        await sleep(25);
        return results;
      }
    )()`,
    returnByValue: true,
    awaitPromise: true,
  });
  return evaluated.result.value as PageState["visibleMarkerHits"];
}

function visibleMarkerStatus(hit: PageState["visibleMarkerHits"][number]): string {
  if (!hit.present) return "missing";
  if (!hit.visible) return "hidden";
  if (!hit.unobscured) return "covered";
  return "visible";
}

async function analyzeScreenshotVisual(client: CdpClient, screenshotBase64: string): Promise<ScreenshotVisualStats> {
  const evaluated = await client.send("Runtime.evaluate", {
    expression: `(
      async () => {
        const image = new Image();
        image.src = ${JSON.stringify(`data:image/png;base64,${screenshotBase64}`)};
        await image.decode();

        const maxDimension = 96;
        const scale = maxDimension / Math.max(image.naturalWidth, image.naturalHeight);
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("Unable to create screenshot analysis canvas");

        context.drawImage(image, 0, 0, width, height);
        const pixels = context.getImageData(0, 0, width, height).data;
        const colors = new Set();
        let nonWhite = 0;
        let minLuma = 255;
        let maxLuma = 0;

        for (let index = 0; index < pixels.length; index += 4) {
          const red = pixels[index];
          const green = pixels[index + 1];
          const blue = pixels[index + 2];
          const alpha = pixels[index + 3];
          const compositedRed = Math.round((red * alpha + 255 * (255 - alpha)) / 255);
          const compositedGreen = Math.round((green * alpha + 255 * (255 - alpha)) / 255);
          const compositedBlue = Math.round((blue * alpha + 255 * (255 - alpha)) / 255);
          colors.add(\`\${compositedRed >> 4}:\${compositedGreen >> 4}:\${compositedBlue >> 4}\`);
          if (compositedRed < 245 || compositedGreen < 245 || compositedBlue < 245) nonWhite += 1;
          const luma = 0.2126 * compositedRed + 0.7152 * compositedGreen + 0.0722 * compositedBlue;
          minLuma = Math.min(minLuma, luma);
          maxLuma = Math.max(maxLuma, luma);
        }

        const samplePixels = width * height;
        return {
          sample_pixels: samplePixels,
          distinct_colors: colors.size,
          non_white_ratio: Number((nonWhite / samplePixels).toFixed(4)),
          luma_range: Number((maxLuma - minLuma).toFixed(1)),
        };
      }
    )()`,
    returnByValue: true,
    awaitPromise: true,
  });
  return evaluated.result.value as ScreenshotVisualStats;
}

function screenshotVisualSummary(stats: ScreenshotVisualStats): string {
  return [
    `sample_pixels=${stats.sample_pixels}`,
    `distinct_colors=${stats.distinct_colors}`,
    `non_white_ratio=${stats.non_white_ratio}`,
    `luma_range=${stats.luma_range}`,
  ].join(" ");
}

async function smokeRoute(port: number, baseUrl: string, route: RouteSmokeConfig, viewport: ViewportConfig, screenshotDir: string, settleMs: number): Promise<RouteSmokeResult> {
  const target = await fetchJson(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" });
  const client = await CdpClient.connect(target.webSocketDebuggerUrl);
  const errors: string[] = [];

  client.on("Runtime.exceptionThrown", (params) => {
    errors.push(summarizeRuntimeException(params));
  });
  client.on("Runtime.consoleAPICalled", (params) => {
    if (params.type === "error") {
      const text = (params.args ?? []).map((arg: any) => arg.value ?? arg.description ?? "").join(" ");
      errors.push(`console.error: ${text}`.trim());
    }
  });
  client.on("Log.entryAdded", (params) => {
    if (params.entry?.level === "error") {
      errors.push(`log.error: ${params.entry.text ?? "Browser log error"}`);
    }
  });

  try {
    await client.send("Runtime.enable");
    await client.send("Log.enable");
    await client.send("Page.enable");
    await client.send("Network.enable");
    await client.send("Network.setCacheDisabled", { cacheDisabled: true });
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: viewport.mobile,
    });
    await client.send("Emulation.setTouchEmulationEnabled", { enabled: viewport.mobile });

    const url = `${baseUrl}${route.path}`;
    const load = client.waitFor("Page.loadEventFired", 90_000);
    await client.send("Page.navigate", { url });
    await load;
    await sleep(settleMs);

    const expression = `(() => {
      const text = document.body?.innerText ?? "";
      const lower = text.toLowerCase();
      const markers = ${JSON.stringify(route.markers)};
      const forbiddenPatterns = ${JSON.stringify(publicForbiddenTermPatternSpecs(route.forbiddenText))};
      return {
        href: location.href,
        title: document.title,
        markerHits: markers.map((marker) => ({ marker, present: lower.includes(marker.toLowerCase()) })),
        forbiddenHits: forbiddenPatterns
          .filter(({ source, flags }) => new RegExp(source, flags).test(text))
          .map(({ term }) => term),
        hasErrorOverlay: text.includes("Unhandled Runtime Error") || text.includes("Application error") || text.includes("This page could not be found"),
        bodyLength: text.length,
      };
    })()`;
    const evaluated = await client.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    const state = evaluated.result.value as PageState;
    state.visibleMarkerHits = await runMarkerVisibilityProbe(client, route.markers);
    const interaction = await runThemeToggleInteraction(client);
    const screenshot = await client.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
    });
    const screenshotPath = join(screenshotDir, `${viewport.name}-${routeFileStem(route.path)}.png`);
    const screenshotBuffer = Buffer.from(screenshot.data, "base64");
    const screenshotDimensions = pngDimensions(screenshotBuffer);
    const screenshotVisual = await analyzeScreenshotVisual(client, screenshot.data);
    await writeFile(screenshotPath, screenshotBuffer);

    if (state.bodyLength < 500) {
      errors.push(`page body was unexpectedly short: ${state.bodyLength} characters`);
    }
    if (state.hasErrorOverlay) {
      errors.push("page rendered an application/runtime error overlay");
    }
    const missingMarkers = state.markerHits.filter((hit) => !hit.present);
    for (const missing of missingMarkers) {
      errors.push(`missing marker: ${missing.marker}`);
    }
    const nonVisibleMarkers = state.visibleMarkerHits.filter((hit) => visibleMarkerStatus(hit) !== "visible");
    for (const marker of nonVisibleMarkers) {
      errors.push(`marker was not visibly reachable: ${marker.marker} (${visibleMarkerStatus(marker)})`);
    }
    for (const forbidden of state.forbiddenHits) {
      errors.push(`forbidden text rendered: ${forbidden}`);
    }
    if (!interaction.ok) {
      errors.push(`interaction failed: ${interaction.name} ${interaction.detail}`);
    }
    if (!hasPngSignature(screenshotBuffer)) {
      errors.push("screenshot did not have a PNG signature");
    }
    if (screenshotBuffer.length < MIN_SCREENSHOT_BYTES) {
      errors.push(`screenshot was unexpectedly small: ${screenshotBuffer.length} bytes`);
    }
    if (!screenshotDimensions) {
      errors.push("screenshot dimensions could not be read from PNG header");
    } else if (screenshotDimensions.width !== viewport.width || screenshotDimensions.height !== viewport.height) {
      errors.push(`screenshot dimensions did not match viewport: ${screenshotDimensions.width}x${screenshotDimensions.height} expected ${viewport.width}x${viewport.height}`);
    }
    if (screenshotVisual.distinct_colors < MIN_SCREENSHOT_VISUAL_DISTINCT_COLORS) {
      errors.push(`screenshot had too few sampled colors: ${screenshotVisual.distinct_colors}`);
    }
    if (screenshotVisual.non_white_ratio < MIN_SCREENSHOT_VISUAL_NON_WHITE_RATIO) {
      errors.push(`screenshot non-white ratio was too low: ${screenshotVisual.non_white_ratio}`);
    }
    if (screenshotVisual.luma_range < MIN_SCREENSHOT_VISUAL_LUMA_RANGE) {
      errors.push(`screenshot luma range was too low: ${screenshotVisual.luma_range}`);
    }

    return {
      route: route.path,
      viewport: viewport.name,
      url,
      state,
      interaction,
      errors,
      screenshot_path: screenshotPath,
      screenshot_bytes: screenshotBuffer.length,
      screenshot_dimensions: screenshotDimensions ?? { width: 0, height: 0 },
      screenshot_visual: screenshotVisual,
    };
  } finally {
    client.close();
    await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`).catch(() => undefined);
  }
}

export function buildProof(baseUrl: string, results: RouteSmokeResult[], startedAppServer: boolean): BrowserSmokeProof {
  const failures = results.flatMap((result) => result.errors.map((error) => `${result.viewport} ${result.route}: ${error}`));
  return {
    schema_version: "track54_browser_smoke_proof_v1",
    generated_at: new Date().toISOString(),
    command: `npm run track54:browser-smoke -- --base-url ${baseUrl}`,
    checked: true,
    ok: failures.length === 0,
    output: [
      `app_server=${startedAppServer ? "started" : "already_reachable"}`,
      ...results.flatMap((result) => [
        `${result.viewport} ${result.route}: loaded ${result.state.href}`,
        `${result.viewport} ${result.route}: title=${result.state.title || "(empty)"}`,
        `${result.viewport} ${result.route}: markers=${result.state.markerHits.map((hit) => `${hit.marker}:${hit.present ? "yes" : "no"}`).join(", ")}`,
        `${result.viewport} ${result.route}: visible_markers=${result.state.visibleMarkerHits.map((hit) => `${hit.marker}:${visibleMarkerStatus(hit)}`).join(", ")}`,
        `${result.viewport} ${result.route}: forbidden_hits=${result.state.forbiddenHits.length === 0 ? "none" : result.state.forbiddenHits.join(", ")}`,
        `${result.viewport} ${result.route}: console_errors=${result.errors.filter((error) => error.startsWith("console.error") || error.startsWith("exception") || error.startsWith("log.error")).length}`,
        `${result.viewport} ${result.route}: interaction=${result.interaction.name}:${result.interaction.ok ? "ok" : "failed"} ${result.interaction.detail}`,
        `${result.viewport} ${result.route}: screenshot=${result.screenshot_path}`,
        `${result.viewport} ${result.route}: screenshot_bytes=${result.screenshot_bytes}`,
        `${result.viewport} ${result.route}: screenshot_dimensions=${result.screenshot_dimensions.width}x${result.screenshot_dimensions.height}`,
        `${result.viewport} ${result.route}: screenshot_visual=${screenshotVisualSummary(result.screenshot_visual)}`,
      ]),
      ...failures,
    ],
  };
}

async function main(): Promise<void> {
  const baseUrl = normalizeBaseUrl(optionValue("--base-url") ?? "http://127.0.0.1:3110");
  const outPath = resolve(optionValue("--out") ?? "scratch/track54-browser-smoke/browser-smoke-proof.json");
  const settleMs = Number(optionValue("--settle-ms") ?? "1200");
  const viewports = parseViewportMode();
  const chromePath = findChromePath();
  const debugPort = await freePort();
  const userDataDir = await mkdtemp(join(tmpdir(), "track54-chrome-"));
  const screenshotDir = resolve("scratch", "track54-browser-smoke", new Date().toISOString().replace(/[:.]/g, "-"));
  await rm(screenshotDir, { force: true, recursive: true });
  await mkdir(resolve("scratch", "track54-browser-smoke"), { recursive: true });
  await writeFile(join(resolve("scratch", "track54-browser-smoke"), ".keep"), "");
  await mkdir(screenshotDir, { recursive: true });

  let chrome: ChildProcess | null = null;
  let appServer: ChildProcess | null = null;
  try {
    appServer = await ensureAppServer(baseUrl);
    chrome = spawn(chromePath, [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${userDataDir}`,
      "about:blank",
    ], { stdio: "ignore" });
    await waitForChrome(debugPort);

    const results: RouteSmokeResult[] = [];
    for (const viewport of viewports) {
      for (const route of ROUTES) {
        results.push(await smokeRoute(debugPort, baseUrl, route, viewport, screenshotDir, settleMs));
      }
    }

    const proof = buildProof(baseUrl, results, appServer !== null);
    await writeFile(outPath, JSON.stringify(proof, null, 2));
    console.log(JSON.stringify({
      schema_version: "track54_browser_smoke_v1",
      proof_path: outPath,
      checked: proof.checked,
      ok: proof.ok,
      app_server: appServer ? "started" : "already_reachable",
      routes: results.map((result) => ({
        route: result.route,
        viewport: result.viewport,
        errors: result.errors,
        interaction: result.interaction,
        screenshot_path: result.screenshot_path,
        screenshot_bytes: result.screenshot_bytes,
        screenshot_dimensions: result.screenshot_dimensions,
        screenshot_visual: result.screenshot_visual,
      })),
    }, null, 2));
    process.exitCode = proof.ok ? 0 : 1;
  } finally {
    if (chrome && !chrome.killed) chrome.kill();
    if (appServer && !appServer.killed) appServer.kill();
    await rm(userDataDir, { force: true, recursive: true }).catch(() => undefined);
  }
}

function isDirectExecution(): boolean {
  const entryPoint = process.argv[1];
  return Boolean(entryPoint) && import.meta.url === pathToFileURL(resolve(entryPoint)).href;
}

if (isDirectExecution()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
