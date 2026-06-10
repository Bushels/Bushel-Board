"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Billboard, OrbitControls, Text } from "@react-three/drei";
import * as THREE from "three";

import { Badge } from "@/components/ui/badge";
import type {
  DataUniverseLink,
  DataUniverseModel,
  DataUniverseNode,
  DataUniverseRole,
} from "@/lib/thesis/data-universe";
import { cn } from "@/lib/utils";

const ROLE_COLORS: Record<DataUniverseRole, string> = {
  score_input: "#437a22",
  bounded_context: "#c17f24",
  watch_only: "#d97706",
};

const DOMAIN_COLOR = "#2e6b9e";
const BOARD_COLOR = "#c17f24";
const NEUTRAL_GRAIN_COLOR = "#9c937e";
const PARTICLES_PER_LINK = 2;

function roleLabel(role: DataUniverseRole): string {
  if (role === "score_input") return "official input";
  if (role === "bounded_context") return "price context";
  return "watch lead";
}

function nodeColor(node: DataUniverseNode): string {
  if (node.kind === "board") return BOARD_COLOR;
  if (node.kind === "domain") return DOMAIN_COLOR;
  if (node.kind === "grain") {
    const score = node.read?.score;
    if (score == null) return NEUTRAL_GRAIN_COLOR;
    if (score >= 20) return ROLE_COLORS.score_input;
    if (score <= -20) return ROLE_COLORS.watch_only;
    return NEUTRAL_GRAIN_COLOR;
  }
  return ROLE_COLORS[node.role];
}

function grainReadLabel(node: DataUniverseNode): string {
  const read = node.read;
  if (!read || read.score === null || read.confidence === null) return "Read pending";
  const sign = read.score > 0 ? "+" : "";
  return `${sign}${read.score} / ${read.confidence}%`;
}

// Probe once per page load and release the probe context immediately — browsers cap
// live WebGL contexts (~8-16), and a leaked probe context per mount can starve the real
// canvas into "THREE.WebGLRenderer: Context Lost".
let cachedWebglSupport: boolean | null = null;

function canUseWebGL(): boolean {
  if (cachedWebglSupport !== null) return cachedWebglSupport;
  if (typeof document === "undefined") return false;
  if (typeof navigator !== "undefined" && navigator.userAgent.toLowerCase().includes("jsdom")) {
    cachedWebglSupport = false;
    return false;
  }
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl2") ?? canvas.getContext("webgl")) as WebGLRenderingContext | null;
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    cachedWebglSupport = Boolean(gl);
  } catch {
    cachedWebglSupport = false;
  }
  return cachedWebglSupport;
}

function usePrefersReducedMotion(): boolean {
  // This component only mounts client-side (next/dynamic ssr:false), so the initial
  // value can be read lazily at first render instead of via a setState-in-effect.
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener?.("change", onChange);
    return () => query.removeEventListener?.("change", onChange);
  }, []);
  return reduced;
}

interface LinkGeometry {
  from: THREE.Vector3;
  to: THREE.Vector3;
  mid: THREE.Vector3;
  color: THREE.Color;
  link: DataUniverseLink;
}

function buildLinkGeometries(model: DataUniverseModel): LinkGeometry[] {
  const nodeById = new Map(model.nodes.map((node) => [node.id, node]));
  const geometries: LinkGeometry[] = [];

  for (const link of model.links) {
    const from = nodeById.get(link.from);
    const to = nodeById.get(link.to);
    if (!from || !to) continue;

    const fromVec = new THREE.Vector3(...from.position);
    const toVec = new THREE.Vector3(...to.position);
    // Lift the midpoint so flows arc gently instead of cutting straight through rings.
    const mid = fromVec.clone().add(toVec).multiplyScalar(0.5);
    mid.y += 0.9;

    geometries.push({
      from: fromVec,
      to: toVec,
      mid,
      color: new THREE.Color(ROLE_COLORS[link.role]),
      link,
    });
  }

  return geometries;
}

function pointOnArc(geometry: LinkGeometry, t: number, target: THREE.Vector3): THREE.Vector3 {
  // Quadratic bezier: (1-t)^2 A + 2(1-t)t M + t^2 B
  const inv = 1 - t;
  target.set(0, 0, 0);
  target.addScaledVector(geometry.from, inv * inv);
  target.addScaledVector(geometry.mid, 2 * inv * t);
  target.addScaledVector(geometry.to, t * t);
  return target;
}

function FlowEdges({
  linkGeometries,
  selectedNodeId,
}: {
  linkGeometries: LinkGeometry[];
  selectedNodeId: string | null;
}) {
  const geometry = useMemo(() => {
    const segmentsPerArc = 12;
    const positions = new Float32Array(linkGeometries.length * segmentsPerArc * 2 * 3);
    const colors = new Float32Array(linkGeometries.length * segmentsPerArc * 2 * 3);
    const scratch = new THREE.Vector3();
    let offset = 0;

    for (const linkGeometry of linkGeometries) {
      const connected =
        selectedNodeId === null ||
        linkGeometry.link.from === selectedNodeId ||
        linkGeometry.link.to === selectedNodeId;
      const color = linkGeometry.color.clone();
      if (!connected) color.multiplyScalar(0.25);

      for (let segment = 0; segment < segmentsPerArc; segment += 1) {
        for (const t of [segment / segmentsPerArc, (segment + 1) / segmentsPerArc]) {
          pointOnArc(linkGeometry, t, scratch);
          positions[offset] = scratch.x;
          positions[offset + 1] = scratch.y;
          positions[offset + 2] = scratch.z;
          colors[offset] = color.r;
          colors[offset + 1] = color.g;
          colors[offset + 2] = color.b;
          offset += 3;
        }
      }
    }

    const bufferGeometry = new THREE.BufferGeometry();
    bufferGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    bufferGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return bufferGeometry;
  }, [linkGeometries, selectedNodeId]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial vertexColors transparent opacity={0.42} />
    </lineSegments>
  );
}

function FlowParticles({
  linkGeometries,
  paused,
}: {
  linkGeometries: LinkGeometry[];
  paused: boolean;
}) {
  const pointsRef = useRef<THREE.Points>(null);
  const particles = useMemo(
    () =>
      linkGeometries.flatMap((linkGeometry, linkIndex) =>
        Array.from({ length: PARTICLES_PER_LINK }, (_, slot) => ({
          linkIndex,
          t: (slot + 0.3) / PARTICLES_PER_LINK + (linkIndex % 5) * 0.13,
          speed: 0.0016 + Math.min(0.0022, linkGeometry.link.weight * 0.0004),
        })),
      ),
    [linkGeometries],
  );

  const { geometry, colors } = useMemo(() => {
    const positions = new Float32Array(particles.length * 3);
    const colorArray = new Float32Array(particles.length * 3);
    particles.forEach((particle, index) => {
      const color = linkGeometries[particle.linkIndex].color;
      colorArray[index * 3] = color.r;
      colorArray[index * 3 + 1] = color.g;
      colorArray[index * 3 + 2] = color.b;
    });
    const bufferGeometry = new THREE.BufferGeometry();
    bufferGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    bufferGeometry.setAttribute("color", new THREE.BufferAttribute(colorArray, 3));
    return { geometry: bufferGeometry, colors: colorArray };
  }, [particles, linkGeometries]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  const scratch = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    if (!pointsRef.current) return;
    const attribute = pointsRef.current.geometry.getAttribute("position") as THREE.BufferAttribute;

    particles.forEach((particle, index) => {
      if (!paused) {
        particle.t += particle.speed * 16;
        if (particle.t > 1) particle.t -= 1;
      }
      pointOnArc(linkGeometries[particle.linkIndex], particle.t % 1, scratch);
      attribute.setXYZ(index, scratch.x, scratch.y, scratch.z);
    });
    attribute.needsUpdate = true;
  });

  // colors referenced to keep the buffer alive alongside geometry
  void colors;

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial size={0.16} vertexColors transparent opacity={0.95} sizeAttenuation />
    </points>
  );
}

function UniverseNodeMesh({
  node,
  selected,
  hovered,
  onSelect,
  onHover,
}: {
  node: DataUniverseNode;
  selected: boolean;
  hovered: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  const color = nodeColor(node);
  const scale = selected ? 1.35 : hovered ? 1.18 : 1;
  const showLabel = node.kind !== "source" || selected || hovered;

  return (
    <group position={node.position}>
      <mesh
        scale={scale}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(node.id);
        }}
        onPointerOver={(event) => {
          event.stopPropagation();
          onHover(node.id);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          onHover(null);
          document.body.style.cursor = "auto";
        }}
      >
        <sphereGeometry args={[node.radius, 28, 18]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={node.kind === "board" ? 0.5 : selected || hovered ? 0.45 : 0.16}
          roughness={0.42}
          metalness={0.08}
        />
      </mesh>
      {showLabel && (
        <Billboard position={[0, node.radius + 0.42, 0]}>
          <Text
            fontSize={node.kind === "grain" || node.kind === "board" ? 0.42 : 0.3}
            color="#2a261e"
            outlineWidth={0.012}
            outlineColor="#f5f3ee"
            anchorX="center"
            anchorY="bottom"
            maxWidth={4.4}
            textAlign="center"
          >
            {node.label}
          </Text>
        </Billboard>
      )}
    </group>
  );
}

function UniverseScene({
  model,
  linkGeometries,
  selectedNodeId,
  reducedMotion,
  onSelect,
  onHover,
  hoveredNodeId,
}: {
  model: DataUniverseModel;
  linkGeometries: LinkGeometry[];
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  reducedMotion: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  return (
    <>
      <ambientLight color="#f5f3ee" intensity={1.9} />
      <directionalLight color="#fff2d0" intensity={2.2} position={[6, 9, 5]} />
      <directionalLight color="#d3e7bb" intensity={0.9} position={[-7, 4, -5]} />

      <FlowEdges linkGeometries={linkGeometries} selectedNodeId={selectedNodeId} />
      <FlowParticles linkGeometries={linkGeometries} paused={reducedMotion} />

      {model.nodes.map((node) => (
        <UniverseNodeMesh
          key={node.id}
          node={node}
          selected={selectedNodeId === node.id}
          hovered={hoveredNodeId === node.id}
          onSelect={onSelect}
          onHover={onHover}
        />
      ))}

      <OrbitControls
        enablePan={false}
        minDistance={6}
        maxDistance={26}
        autoRotate={!reducedMotion}
        autoRotateSpeed={0.55}
        maxPolarAngle={Math.PI * 0.62}
      />
    </>
  );
}

function SelectedNodeDetails({
  model,
  selectedNodeId,
}: {
  model: DataUniverseModel;
  selectedNodeId: string | null;
}) {
  const node = model.nodes.find((candidate) => candidate.id === selectedNodeId) ?? null;
  if (!node) {
    return (
      <p className="text-sm leading-6 text-muted-foreground">
        Click any node to see what it is, what it feeds, and how strongly it talks to the rest of the system.
      </p>
    );
  }

  const nodeById = new Map(model.nodes.map((candidate) => [candidate.id, candidate]));
  const connections = model.links
    .filter((link) => link.from === node.id || link.to === node.id)
    .map((link) => {
      const otherId = link.from === node.id ? link.to : link.from;
      const direction = link.from === node.id ? "feeds" : "fed by";
      return { other: nodeById.get(otherId), direction, link };
    })
    .filter((connection) => connection.other)
    .sort((left, right) => right.link.weight - left.link.weight)
    .slice(0, 6);

  return (
    <div data-testid="data-universe-selected" className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display text-lg font-semibold">{node.label}</h3>
        <Badge variant="outline" className="border-border bg-muted/40 text-muted-foreground">
          {node.kind === "board" ? "the read" : node.kind}
        </Badge>
        {node.kind === "source" && (
          <Badge variant="outline" className="border-border bg-muted/40 text-muted-foreground">
            {roleLabel(node.role)}
          </Badge>
        )}
        {node.kind === "grain" && (
          <Badge variant="outline" className="border-border bg-muted/40 text-muted-foreground tabular-nums">
            {grainReadLabel(node)}
          </Badge>
        )}
      </div>
      <p className="text-sm leading-6 text-muted-foreground">{node.detail}</p>
      {connections.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {connections.map((connection) => (
            <span
              key={connection.link.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs text-foreground/90"
            >
              <span className="text-muted-foreground">{connection.direction}</span>
              <span className="font-medium">{connection.other!.label}</span>
              <span className="tabular-nums text-muted-foreground">x{connection.link.weight}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

const MAX_CONTEXT_RECOVERIES = 3;

export function DataUniverseScene({ model }: { model: DataUniverseModel }) {
  // Client-only component (ssr:false): probe lazily at first render; the probe result
  // is module-cached and the probe context is released immediately.
  const [webglOk, setWebglOk] = useState<boolean>(() => canUseWebGL());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  // Bumping the key remounts the Canvas with a brand-new <canvas> element, which is the
  // only reliable recovery from a lost WebGL context (a canvas can never get a second
  // context of the same type, so a lost one is lost for that element's lifetime).
  const [canvasEpoch, setCanvasEpoch] = useState(0);
  const recoveriesRef = useRef(0);
  const lostListenerCleanupRef = useRef<(() => void) | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const linkGeometries = useMemo(() => buildLinkGeometries(model), [model]);

  useEffect(() => {
    return () => {
      // Detach any live context-lost listener and don't leave the page cursor
      // stuck on "pointer" if the scene unmounts mid-hover.
      lostListenerCleanupRef.current?.();
      lostListenerCleanupRef.current = null;
      document.body.style.cursor = "auto";
    };
  }, []);

  const handleCanvasCreated = (state: { gl: THREE.WebGLRenderer }) => {
    const canvas = state.gl.domElement;
    // A keyed remount creates a new canvas; release the previous canvas's listener first.
    lostListenerCleanupRef.current?.();
    const onLost = (event: Event) => {
      event.preventDefault();
      canvas.removeEventListener("webglcontextlost", onLost);
      lostListenerCleanupRef.current = null;
      if (recoveriesRef.current >= MAX_CONTEXT_RECOVERIES) {
        setWebglOk(false);
        return;
      }
      recoveriesRef.current += 1;
      setCanvasEpoch((epoch) => epoch + 1);
    };
    canvas.addEventListener("webglcontextlost", onLost);
    lostListenerCleanupRef.current = () => canvas.removeEventListener("webglcontextlost", onLost);
  };

  return (
    <div className="space-y-4">
      <div
        data-testid="data-universe-canvas-frame"
        className="relative h-[420px] overflow-hidden rounded-lg border border-border bg-card sm:h-[560px]"
      >
        {webglOk ? (
          <Canvas
            key={`universe-canvas-${canvasEpoch}`}
            dpr={[1, 2]}
            camera={{ position: [0, 8.5, 15.5], fov: 44 }}
            gl={{ preserveDrawingBuffer: true, antialias: true }}
            onCreated={handleCanvasCreated}
            onPointerMissed={() => setSelectedNodeId(null)}
          >
            <UniverseScene
              model={model}
              linkGeometries={linkGeometries}
              selectedNodeId={selectedNodeId}
              hoveredNodeId={hoveredNodeId}
              reducedMotion={reducedMotion}
              onSelect={(id) => setSelectedNodeId((current) => (current === id ? null : id))}
              onHover={setHoveredNodeId}
            />
          </Canvas>
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
            3D view is unavailable on this device. The counts and legend below describe the same system.
          </div>
        )}
        <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-2">
          <span className={cn("inline-flex items-center gap-1.5 rounded-full bg-background/85 px-2.5 py-1 text-xs")}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: ROLE_COLORS.score_input }} />
            official inputs
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-background/85 px-2.5 py-1 text-xs">
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: ROLE_COLORS.bounded_context }} />
            price context
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-background/85 px-2.5 py-1 text-xs">
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: ROLE_COLORS.watch_only }} />
            watch leads
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-background/85 px-2.5 py-1 text-xs">
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: DOMAIN_COLOR }} />
            pressure lanes
          </span>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-muted/20 p-4">
        <SelectedNodeDetails model={model} selectedNodeId={selectedNodeId} />
      </div>
    </div>
  );
}
