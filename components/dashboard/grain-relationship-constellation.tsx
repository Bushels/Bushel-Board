"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { BufferGeometry, Material, Mesh, Object3D, Texture } from "three";

import { Badge } from "@/components/ui/badge";
import type {
  GrainImpactGraphBoardRead,
  GrainImpactGraphScoreRole,
  GrainRelationshipOverviewEdge,
  GrainRelationshipOverviewModel,
  GrainRelationshipOverviewNode,
} from "@/lib/thesis/grain-impact-graph";
import { cn } from "@/lib/utils";

type ThreeModule = typeof import("three");

export interface GrainRelationshipConstellationNode {
  id: string;
  label: string;
  kind: GrainRelationshipOverviewNode["kind"];
  scoreRole: GrainImpactGraphScoreRole;
  rank: number;
  x: number;
  y: number;
  z: number;
  radius: number;
  incomingCount: number;
  outgoingCount: number;
  readScore: number | null;
  readConfidence: number | null;
  readLabel: string;
}

export interface GrainRelationshipConstellationEdge {
  id: string;
  from: string;
  to: string;
  fromLabel: string;
  toLabel: string;
  rank: number;
  scoreRole: GrainImpactGraphScoreRole;
  kind: GrainRelationshipOverviewEdge["kind"];
}

export interface GrainRelationshipConstellationLayout {
  nodes: GrainRelationshipConstellationNode[];
  edges: GrainRelationshipConstellationEdge[];
  strongestEdge: GrainRelationshipConstellationEdge | null;
  maxRank: number;
}

const GRAIN_RING_RADIUS_X = 4.35;
const GRAIN_RING_RADIUS_Z = 3.1;
const EXTERNAL_RING_RADIUS_X = 5.65;
const EXTERNAL_RING_RADIUS_Z = 4.15;
const READ_VERTICAL_RANGE = 2.15;

function scoreRoleLabel(scoreRole: GrainImpactGraphScoreRole): string {
  if (scoreRole === "score_input") return "Scores";
  if (scoreRole === "bounded_context") return "Bounded context";
  if (scoreRole === "watch_only") return "Watch only";
  return "Blocked gap";
}

function relationshipKindLabel(kind: GrainRelationshipOverviewEdge["kind"]): string {
  return kind.replaceAll("_", " ");
}

function formatSignedScore(score: number | null | undefined): string {
  if (score === null || score === undefined) return "No score";
  if (score > 0) return `+${score}`;
  return String(score);
}

function boardReadByGrain(boardReads: readonly GrainImpactGraphBoardRead[]): Map<string, GrainImpactGraphBoardRead> {
  return new Map(boardReads.map((read) => [read.grain, read]));
}

function readLabel(read: GrainImpactGraphBoardRead | undefined): string {
  if (!read || read.score === null) return "Current read pending";
  const confidence = read.confidence === null ? "n/a" : `${read.confidence}%`;
  return `${formatSignedScore(read.score)} / ${confidence}`;
}

function confidenceWeightedRead(read: GrainImpactGraphBoardRead | undefined): number {
  if (!read || read.score === null || read.confidence === null) return 0;
  const score = Math.max(-100, Math.min(100, read.score));
  const confidence = Math.max(0, Math.min(100, read.confidence)) / 100;
  return score * confidence;
}

function nodeColor(node: GrainRelationshipConstellationNode): string {
  if (node.kind === "external_anchor") return scoreRoleColor(node.scoreRole);
  if (node.readScore !== null && node.readScore > 0) return "#437a22";
  if (node.readScore !== null && node.readScore < 0) return "#d97706";
  return "#7c6c43";
}

function scoreRoleColor(scoreRole: GrainImpactGraphScoreRole): string {
  if (scoreRole === "score_input") return "#437a22";
  if (scoreRole === "bounded_context") return "#c17f24";
  if (scoreRole === "watch_only") return "#d97706";
  return "#b33a3a";
}

function scoreRoleClass(scoreRole: GrainImpactGraphScoreRole): string {
  if (scoreRole === "score_input") return "border-prairie/25 bg-prairie/10 text-prairie";
  if (scoreRole === "bounded_context") return "border-canola/35 bg-canola/10 text-canola";
  if (scoreRole === "watch_only") return "border-amber-600/25 bg-amber-500/10 text-amber-800 dark:text-amber-300";
  return "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300";
}

function canUseWebGL(): boolean {
  if (typeof document === "undefined") return false;
  if (typeof navigator !== "undefined" && navigator.userAgent.toLowerCase().includes("jsdom")) return false;
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl2") ?? canvas.getContext("webgl")) as WebGLRenderingContext | null;
    // Release the probe context immediately — leaked probes count against the
    // browser's live WebGL context cap and can starve the real canvas.
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return Boolean(gl);
  } catch {
    return false;
  }
}

function rankForNode(node: GrainRelationshipOverviewNode, edges: readonly GrainRelationshipOverviewEdge[]): number {
  const edgeRank = edges.reduce((sum, edge) => {
    if (edge.from === node.id || edge.to === node.id) return sum + edge.rank;
    return sum;
  }, 0);
  return Math.max(node.rank, edgeRank);
}

function rankedRadius(rank: number, maxRank: number, kind: GrainRelationshipOverviewNode["kind"]): number {
  const share = maxRank <= 0 ? 0 : Math.min(1, rank / maxRank);
  return kind === "grain" ? 0.26 + share * 0.34 : 0.18 + share * 0.22;
}

export function buildGrainRelationshipConstellationLayout({
  overview,
  boardReads = [],
}: {
  overview: GrainRelationshipOverviewModel;
  boardReads?: readonly GrainImpactGraphBoardRead[];
}): GrainRelationshipConstellationLayout {
  const readsByGrain = boardReadByGrain(boardReads);
  const nodesWithRank = overview.nodes.map((node) => ({
    node,
    rank: rankForNode(node, overview.edges),
  }));
  const maxRank = Math.max(1, ...nodesWithRank.map((item) => item.rank));
  const grainNodes = nodesWithRank.filter((item) => item.node.kind === "grain");
  const externalNodes = nodesWithRank.filter((item) => item.node.kind === "external_anchor");
  const nodes: GrainRelationshipConstellationNode[] = [];

  grainNodes.forEach((item, index) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * index) / Math.max(1, grainNodes.length);
    const read = readsByGrain.get(item.node.label);
    const weightedRead = confidenceWeightedRead(read);

    nodes.push({
      id: item.node.id,
      label: item.node.label,
      kind: item.node.kind,
      scoreRole: item.node.scoreRole,
      rank: item.rank,
      x: Math.cos(angle) * GRAIN_RING_RADIUS_X,
      y: (weightedRead / 100) * READ_VERTICAL_RANGE,
      z: Math.sin(angle) * GRAIN_RING_RADIUS_Z,
      radius: rankedRadius(item.rank, maxRank, item.node.kind),
      incomingCount: item.node.incomingCount,
      outgoingCount: item.node.outgoingCount,
      readScore: read?.score ?? null,
      readConfidence: read?.confidence ?? null,
      readLabel: readLabel(read),
    });
  });

  externalNodes.forEach((item, index) => {
    const angle = Math.PI / 2 + (2 * Math.PI * index) / Math.max(1, externalNodes.length);

    nodes.push({
      id: item.node.id,
      label: item.node.label,
      kind: item.node.kind,
      scoreRole: item.node.scoreRole,
      rank: item.rank,
      x: Math.cos(angle) * EXTERNAL_RING_RADIUS_X,
      y: -1.85,
      z: Math.sin(angle) * EXTERNAL_RING_RADIUS_Z,
      radius: rankedRadius(item.rank, maxRank, item.node.kind),
      incomingCount: item.node.incomingCount,
      outgoingCount: item.node.outgoingCount,
      readScore: null,
      readConfidence: null,
      readLabel: "External watch anchor",
    });
  });

  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = overview.edges
    .filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to))
    .map((edge) => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      fromLabel: edge.fromLabel,
      toLabel: edge.toLabel,
      rank: edge.rank,
      scoreRole: edge.scoreRole,
      kind: edge.kind,
    }))
    .sort((left, right) => {
      if (left.rank !== right.rank) return right.rank - left.rank;
      return `${left.fromLabel}-${left.toLabel}`.localeCompare(`${right.fromLabel}-${right.toLabel}`);
    });

  return {
    nodes,
    edges,
    strongestEdge: edges[0] ?? null,
    maxRank,
  };
}

function createLabelSprite(THREE: ThreeModule, label: string, color: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 384;
  canvas.height = 112;
  const context = canvas.getContext("2d");

  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "rgba(245, 243, 238, 0.88)";
    context.strokeStyle = "rgba(124, 108, 67, 0.35)";
    context.lineWidth = 4;
    context.beginPath();
    context.roundRect(10, 18, 364, 74, 18);
    context.fill();
    context.stroke();
    context.fillStyle = color;
    context.font = "600 30px Arial, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(label, canvas.width / 2, canvas.height / 2 + 2, 330);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.6, 0.47, 1);

  return { sprite, texture, material };
}

function disposeMany(resources: Array<BufferGeometry | Material | Texture>) {
  resources.forEach((resource) => resource.dispose());
}

function SelectedConstellationDetails({
  node,
  edges,
}: {
  node: GrainRelationshipConstellationNode | undefined;
  edges: readonly GrainRelationshipConstellationEdge[];
}) {
  if (!node) return null;

  const connectedEdges = edges
    .filter((edge) => edge.from === node.id || edge.to === node.id)
    .slice(0, 4);

  return (
    <div className="grid gap-3 lg:grid-cols-[1.1fr_1.4fr]">
      <div className="rounded-md border border-border bg-background p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Selected 3D node</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h4 data-testid="grain-relationship-3d-selected-label" className="font-display text-lg font-semibold">
            {node.label}
          </h4>
          <Badge variant="outline" className={scoreRoleClass(node.scoreRole)}>
            {scoreRoleLabel(node.scoreRole)}
          </Badge>
          <Badge variant="outline" className="border-border bg-muted/40 text-muted-foreground tabular-nums">
            rank {node.rank}
          </Badge>
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Vertical position is the current board read pulled toward neutral by confidence. Size is total relationship
          weight. Links are directed from the grain or anchor pushing influence to the grain receiving it.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge variant="outline" className="border-border bg-background/70 text-muted-foreground tabular-nums">
            {node.readLabel}
          </Badge>
          <Badge variant="outline" className="border-border bg-background/70 text-muted-foreground tabular-nums">
            {node.outgoingCount} out / {node.incomingCount} in
          </Badge>
        </div>
      </div>

      <div className="rounded-md border border-border bg-background p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Strongest visible links</p>
          <Badge variant="outline" className="border-border bg-muted/40 text-muted-foreground tabular-nums">
            {connectedEdges.length} shown
          </Badge>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {connectedEdges.map((edge) => (
            <div key={`constellation-link-${edge.id}`} className="rounded-md border border-border bg-card p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={scoreRoleClass(edge.scoreRole)}>
                  {scoreRoleLabel(edge.scoreRole)}
                </Badge>
                <Badge variant="outline" className="border-border bg-background/70 text-muted-foreground tabular-nums">
                  rank {edge.rank}
                </Badge>
              </div>
              <p className="mt-2 text-sm font-semibold">
                {edge.fromLabel} to {edge.toLabel}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{relationshipKindLabel(edge.kind)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Stable default: an inline `= []` default would change identity on every render,
// invalidating the layout memo and rebooting the Three.js scene per re-render.
const NO_BOARD_READS: readonly GrainImpactGraphBoardRead[] = [];

export function GrainRelationshipConstellation({
  overview,
  boardReads = NO_BOARD_READS,
}: {
  overview: GrainRelationshipOverviewModel;
  boardReads?: readonly GrainImpactGraphBoardRead[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<string>("");
  const hoveredRef = useRef<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [renderStatus, setRenderStatus] = useState<"loading" | "ready" | "webgl_unavailable">("loading");
  const layout = useMemo(
    () => buildGrainRelationshipConstellationLayout({ overview, boardReads }),
    [overview, boardReads],
  );
  const [selectedNodeId, setSelectedNodeId] = useState(() => layout.nodes[0]?.id ?? "");
  const selectedNode = layout.nodes.find((node) => node.id === selectedNodeId) ?? layout.nodes[0];
  const hoveredNode = layout.nodes.find((node) => node.id === hoveredNodeId);

  useEffect(() => {
    const nextSelected = layout.nodes.some((node) => node.id === selectedNodeId)
      ? selectedNodeId
      : layout.nodes[0]?.id ?? "";
    if (nextSelected !== selectedNodeId) setSelectedNodeId(nextSelected);
  }, [layout.nodes, selectedNodeId]);

  useEffect(() => {
    selectedRef.current = selectedNodeId;
  }, [selectedNodeId]);

  useEffect(() => {
    hoveredRef.current = hoveredNodeId;
  }, [hoveredNodeId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || layout.nodes.length === 0) return;
    const sceneCanvas = canvas;
    const sceneContainer = container;

    if (!canUseWebGL()) {
      setRenderStatus("webgl_unavailable");
      return;
    }

    let disposed = false;
    let frameId = 0;
    let renderer: InstanceType<ThreeModule["WebGLRenderer"]> | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let cleanupCanvasListeners: (() => void) | null = null;
    const resources: Array<BufferGeometry | Material | Texture> = [];
    const nodeMeshes = new Map<string, Mesh>();
    const interactiveMeshes: Object3D[] = [];

    async function boot() {
      const THREE = await import("three");
      if (disposed) return;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
      camera.position.set(0, 5.1, 9.4);
      camera.lookAt(0, 0, 0);

      renderer = new THREE.WebGLRenderer({
        canvas: sceneCanvas,
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
        powerPreference: "high-performance",
      });
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

      scene.add(new THREE.AmbientLight(0xf5f3ee, 2.3));
      const keyLight = new THREE.DirectionalLight(0xfff2d0, 2.8);
      keyLight.position.set(4, 7, 5);
      scene.add(keyLight);
      const fillLight = new THREE.DirectionalLight(0xd3e7bb, 1.2);
      fillLight.position.set(-5, 3, -4);
      scene.add(fillLight);

      const group = new THREE.Group();
      scene.add(group);

      const grid = new THREE.GridHelper(11, 11, 0xd8caa8, 0xeadfc8);
      grid.position.y = 0;
      group.add(grid);

      const nodeById = new Map(layout.nodes.map((node) => [node.id, node]));

      layout.edges.forEach((edge) => {
        const source = nodeById.get(edge.from);
        const target = nodeById.get(edge.to);
        if (!source || !target) return;

        const start = new THREE.Vector3(source.x, source.y, source.z);
        const end = new THREE.Vector3(target.x, target.y, target.z);
        const direction = new THREE.Vector3().subVectors(end, start).normalize();
        const arrowPoint = end.clone().sub(direction.clone().multiplyScalar(target.radius + 0.18));
        const geometry = new THREE.BufferGeometry().setFromPoints([start, arrowPoint]);
        const material = new THREE.LineBasicMaterial({
          color: scoreRoleColor(edge.scoreRole),
          transparent: true,
          opacity: 0.28 + Math.min(0.48, edge.rank / 140),
        });
        resources.push(geometry, material);
        group.add(new THREE.Line(geometry, material));

        const coneGeometry = new THREE.ConeGeometry(0.085 + Math.min(0.06, edge.rank / 900), 0.28, 18);
        const coneMaterial = new THREE.MeshStandardMaterial({
          color: scoreRoleColor(edge.scoreRole),
          roughness: 0.74,
          metalness: 0.02,
          transparent: true,
          opacity: 0.72,
        });
        resources.push(coneGeometry, coneMaterial);
        const cone = new THREE.Mesh(coneGeometry, coneMaterial);
        cone.position.copy(arrowPoint);
        cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
        group.add(cone);
      });

      layout.nodes.forEach((node) => {
        const geometry = new THREE.SphereGeometry(node.radius, 32, 18);
        const material = new THREE.MeshStandardMaterial({
          color: nodeColor(node),
          roughness: 0.46,
          metalness: 0.08,
          emissive: nodeColor(node),
          emissiveIntensity: node.kind === "grain" ? 0.08 : 0.03,
        });
        resources.push(geometry, material);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(node.x, node.y, node.z);
        mesh.userData = { nodeId: node.id };
        group.add(mesh);
        nodeMeshes.set(node.id, mesh);
        interactiveMeshes.push(mesh);

        const hitGeometry = new THREE.SphereGeometry(node.radius + 0.42, 18, 12);
        const hitMaterial = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0,
          depthWrite: false,
        });
        hitMaterial.colorWrite = false;
        resources.push(hitGeometry, hitMaterial);
        const hitMesh = new THREE.Mesh(hitGeometry, hitMaterial);
        hitMesh.position.copy(mesh.position);
        hitMesh.userData = { nodeId: node.id };
        group.add(hitMesh);
        interactiveMeshes.push(hitMesh);

        const label = createLabelSprite(THREE, node.label, nodeColor(node));
        resources.push(label.texture, label.material);
        label.sprite.position.set(node.x, node.y + node.radius + 0.46, node.z);
        group.add(label.sprite);
      });

      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

      const resize = () => {
        if (!renderer) return;
        const rect = sceneContainer.getBoundingClientRect();
        const width = Math.max(320, Math.floor(rect.width));
        const height = Math.max(360, Math.floor(rect.height));
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };

      const pickNode = (event: PointerEvent, commit: boolean) => {
        const rect = sceneCanvas.getBoundingClientRect();
        pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects(interactiveMeshes, false)[0];
        const nextNodeId = typeof hit?.object.userData.nodeId === "string" ? hit.object.userData.nodeId : null;
        setHoveredNodeId((current) => (current === nextNodeId ? current : nextNodeId));
        sceneCanvas.style.cursor = nextNodeId ? "pointer" : "grab";
        if (commit && nextNodeId) setSelectedNodeId(nextNodeId);
      };

      const animate = () => {
        if (!reducedMotion.matches) group.rotation.y += 0.0028;

        nodeMeshes.forEach((mesh, nodeId) => {
          const selected = selectedRef.current === nodeId;
          const hovered = hoveredRef.current === nodeId;
          const scale = selected ? 1.32 : hovered ? 1.18 : 1;
          mesh.scale.lerp(new THREE.Vector3(scale, scale, scale), 0.18);
        });

        renderer?.render(scene, camera);
        frameId = window.requestAnimationFrame(animate);
      };

      const handlePointerMove = (event: PointerEvent) => pickNode(event, false);
      const handlePointerLeave = () => {
        setHoveredNodeId(null);
        sceneCanvas.style.cursor = "grab";
      };
      const handleClick = (event: PointerEvent) => pickNode(event, true);

      sceneCanvas.addEventListener("pointermove", handlePointerMove);
      sceneCanvas.addEventListener("pointerleave", handlePointerLeave);
      sceneCanvas.addEventListener("click", handleClick);
      cleanupCanvasListeners = () => {
        sceneCanvas.removeEventListener("pointermove", handlePointerMove);
        sceneCanvas.removeEventListener("pointerleave", handlePointerLeave);
        sceneCanvas.removeEventListener("click", handleClick);
      };

      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(sceneContainer);
      resize();
      setRenderStatus("ready");
      frameId = window.requestAnimationFrame(animate);
    }

    void boot();

    return () => {
      disposed = true;
      if (frameId) window.cancelAnimationFrame(frameId);
      cleanupCanvasListeners?.();
      resizeObserver?.disconnect();
      disposeMany(resources);
      nodeMeshes.clear();
      renderer?.dispose();
    };
  }, [layout]);

  if (layout.nodes.length === 0) return null;

  const strongestEdge = layout.strongestEdge;

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Badge variant="outline" className="mb-3 w-fit border-canola/35 bg-canola/10 text-canola">
            Three.js audit layer
          </Badge>
          <h3 className="font-display text-xl font-semibold">3D Relationship Constellation</h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            Spatial view of the same ranked relationship model. Height shows the current bull or bear read after
            confidence scaling, node size shows total relationship weight, and arrows show directed influence.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="border-border bg-background/70 text-muted-foreground tabular-nums">
            {layout.nodes.length} nodes
          </Badge>
          <Badge variant="outline" className="border-border bg-background/70 text-muted-foreground tabular-nums">
            {layout.edges.length} directed links
          </Badge>
          {strongestEdge ? (
            <Badge variant="outline" className="border-canola/35 bg-canola/10 text-canola tabular-nums">
              top {strongestEdge.fromLabel} to {strongestEdge.toLabel} {strongestEdge.rank}
            </Badge>
          ) : null}
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative h-[430px] overflow-hidden rounded-md border border-border bg-[radial-gradient(circle_at_50%_20%,rgba(193,127,36,0.13),transparent_38%),linear-gradient(180deg,rgba(245,243,238,0.95),rgba(245,243,238,0.72))] sm:h-[520px]"
      >
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="3D relationship constellation showing ranked grain influence links and current board reads"
          data-testid="grain-relationship-3d-canvas"
          className="h-full w-full"
        />

        {renderStatus !== "ready" ? (
          <div className="absolute inset-0 flex items-center justify-center bg-background/65 p-6 text-center">
            <div className="max-w-sm rounded-md border border-border bg-card p-4 shadow-sm">
              <p className="text-sm font-semibold">
                {renderStatus === "webgl_unavailable" ? "3D canvas unavailable" : "Loading 3D relationship view"}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                The ranked SVG map and matrix below remain the audit fallback if this browser cannot start WebGL.
              </p>
            </div>
          </div>
        ) : null}

        <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-2">
          <Badge variant="outline" className="border-prairie/25 bg-background/80 text-prairie">
            higher = more bullish
          </Badge>
          <Badge variant="outline" className="border-amber-600/25 bg-background/80 text-amber-800">
            lower = more bearish
          </Badge>
          <Badge variant="outline" className="border-border bg-background/80 text-muted-foreground">
            size = relationship weight
          </Badge>
        </div>

        <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex flex-wrap gap-2">
          {(["score_input", "bounded_context", "watch_only", "parked_gap"] as const).map((scoreRole) => (
            <Badge key={`constellation-legend-${scoreRole}`} variant="outline" className={cn("bg-background/85", scoreRoleClass(scoreRole))}>
              {scoreRoleLabel(scoreRole)}
            </Badge>
          ))}
          {hoveredNode ? (
            <Badge variant="outline" className="border-canola/35 bg-background/85 text-canola">
              hover {hoveredNode.label}
            </Badge>
          ) : null}
        </div>
      </div>

      <SelectedConstellationDetails node={selectedNode} edges={layout.edges} />
    </div>
  );
}
