"use client"

import { cn } from "@/lib/utils"

interface GrainIconProps {
  grain: string
  className?: string
  size?: number
}

type SvgRenderer = (s: number) => React.ReactElement

/**
 * Monochrome SVG grain icons. Uses currentColor so they inherit text color.
 * Covers all 16 CGC grain types with distinct icons.
 */
const ICONS: Record<string, SvgRenderer> = {
  /* Wheat stalk — paired kernels along a stem */
  wheat: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22V8" />
      <path d="M9 11c-1.5-1.5-2-3.5-1-5 2 0 3.5.5 5 2" />
      <path d="M15 11c1.5-1.5 2-3.5 1-5-2 0-3.5.5-5 2" />
      <path d="M9 7c-1.5-1.5-2-3.5-1-5 2 0 3.5.5 5 2" />
      <path d="M15 7c1.5-1.5 2-3.5 1-5-2 0-3.5.5-5 2" />
      <path d="M9 15c-1.5-1.5-2-3.5-1-5 2 0 3.5.5 5 2" />
      <path d="M15 15c1.5-1.5 2-3.5 1-5-2 0-3.5.5-5 2" />
    </svg>
  ),

  /* Durum — similar to wheat but stiffer, with a prominent awn at top */
  durum: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22V7" />
      <path d="M12 7l-1-5" />
      <path d="M12 7l1-5" />
      <path d="M9 10c-1.5-1-2-3-1-4.5 1.5 0 3 .5 4 1.5" />
      <path d="M15 10c1.5-1 2-3 1-4.5-1.5 0-3 .5-4 1.5" />
      <path d="M9 14c-1.5-1-2-3-1-4.5 1.5 0 3 .5 4 1.5" />
      <path d="M15 14c1.5-1 2-3 1-4.5-1.5 0-3 .5-4 1.5" />
      <path d="M9 18c-1.5-1-2-3-1-4.5 1.5 0 3 .5 4 1.5" />
      <path d="M15 18c1.5-1 2-3 1-4.5-1.5 0-3 .5-4 1.5" />
    </svg>
  ),

  /* Canola — 4-petal cruciform flower */
  canola: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <path d="M12 2c-1.5 2-1.5 4.5 0 6.5" />
      <path d="M12 2c1.5 2 1.5 4.5 0 6.5" />
      <path d="M22 12c-2-1.5-4.5-1.5-6.5 0" />
      <path d="M22 12c-2 1.5-4.5 1.5-6.5 0" />
      <path d="M12 22c-1.5-2-1.5-4.5 0-6.5" />
      <path d="M12 22c1.5-2 1.5-4.5 0-6.5" />
      <path d="M2 12c2-1.5 4.5-1.5 6.5 0" />
      <path d="M2 12c2 1.5 4.5 1.5 6.5 0" />
    </svg>
  ),

  /* Barley — head with long awns */
  barley: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22V6" />
      <path d="M8 14l4-2 4 2" />
      <path d="M8 10l4-2 4 2" />
      <path d="M9 6l3-2 3 2" />
      <path d="M10 3l2-1 2 1" />
      <path d="M7 14l-2 3" />
      <path d="M17 14l2 3" />
      <path d="M7 10l-3 2" />
      <path d="M17 10l3 2" />
    </svg>
  ),

  /* Oats — drooping panicle branches */
  oats: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22V4" />
      <path d="M12 6c-2 0-4 1.5-4 4" />
      <path d="M12 6c2 0 4 1.5 4 4" />
      <path d="M12 10c-3 0-5 2-5 4" />
      <path d="M12 10c3 0 5 2 5 4" />
      <path d="M12 14c-2.5 0-4 1.5-4 3" />
      <path d="M12 14c2.5 0 4 1.5 4 3" />
    </svg>
  ),

  /* Pea/pulse pod — pod shape with peas inside */
  pulse: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 12c0-4 3-7 6-7s6 3 6 7-3 7-6 7-6-3-6-7Z" />
      <circle cx="10" cy="12" r="1.5" fill="currentColor" />
      <circle cx="14" cy="12" r="1.5" fill="currentColor" />
      <path d="M5 12h14" />
    </svg>
  ),

  /* Corn — ear with husk leaves */
  corn: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 22V18c0-4 1-8 2-10" />
      <ellipse cx="12" cy="10" rx="3.5" ry="7" />
      <path d="M9.5 7h5" />
      <path d="M9 10h6" />
      <path d="M9.5 13h5" />
      <path d="M15 5c1-1 2.5-1.5 4-1" />
      <path d="M15 8c2 0 4-.5 5-2" />
    </svg>
  ),

  /* Soybeans — three-bean pod, rounder than pulse */
  soybeans: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12c0-3.5 3-6.5 7-6.5s7 3 7 6.5-3 6.5-7 6.5-7-3-7-6.5Z" />
      <circle cx="9" cy="12" r="1.5" fill="currentColor" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      <circle cx="15" cy="12" r="1.5" fill="currentColor" />
    </svg>
  ),

  /* Flaxseed — small teardrop seed */
  flaxseed: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4c-2 3-5 6-5 10a5 5 0 0 0 10 0c0-4-3-7-5-10Z" fill="currentColor" opacity="0.15" />
      <path d="M12 4c-2 3-5 6-5 10a5 5 0 0 0 10 0c0-4-3-7-5-10Z" />
      <path d="M12 8v10" />
    </svg>
  ),

  /* Rye — wheat-like but more slender, asymmetric awns */
  rye: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22V6" />
      <path d="M12 6l-2-4" />
      <path d="M9 9c-2-.5-3-2-2.5-4 1.5.5 2.5 1.5 3.5 3" />
      <path d="M15 10c2-.5 3-2 2.5-4-1.5.5-2.5 1.5-3.5 3" />
      <path d="M9 13c-2-.5-3-2-2.5-4 1.5.5 2.5 1.5 3.5 3" />
      <path d="M15 14c2-.5 3-2 2.5-4-1.5.5-2.5 1.5-3.5 3" />
      <path d="M9 17c-2-.5-3-2-2.5-4 1.5.5 2.5 1.5 3.5 3" />
      <path d="M15 18c2-.5 3-2 2.5-4-1.5.5-2.5 1.5-3.5 3" />
    </svg>
  ),

  /* Mustard seed — small round seed cluster */
  mustard: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="13" r="2.5" fill="currentColor" opacity="0.15" />
      <circle cx="12" cy="13" r="2.5" />
      <circle cx="8" cy="11" r="2" fill="currentColor" opacity="0.15" />
      <circle cx="8" cy="11" r="2" />
      <circle cx="16" cy="11" r="2" fill="currentColor" opacity="0.15" />
      <circle cx="16" cy="11" r="2" />
      <path d="M12 7V3" />
      <path d="M10 5l2-2 2 2" />
    </svg>
  ),

  /* Sunflower — flower head with petals */
  sunflower: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="10" r="3.5" fill="currentColor" opacity="0.15" />
      <circle cx="12" cy="10" r="3.5" />
      <path d="M12 3v3" />
      <path d="M12 14v3" />
      <path d="M5 10h3" />
      <path d="M16 10h3" />
      <path d="M7.05 5.05l2.12 2.12" />
      <path d="M14.83 12.83l2.12 2.12" />
      <path d="M7.05 14.95l2.12-2.12" />
      <path d="M14.83 7.17l2.12-2.12" />
      <path d="M12 17v5" />
    </svg>
  ),

  /* Canaryseed — small elongated seed, similar to a grain of rice */
  canaryseed: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="11" rx="2.5" ry="5" fill="currentColor" opacity="0.15" />
      <ellipse cx="12" cy="11" rx="2.5" ry="5" />
      <path d="M12 6V3" />
      <path d="M10 4l2-2 2 2" />
      <path d="M12 16v5" />
    </svg>
  ),

  /* Generic kernel fallback */
  kernel: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="13" rx="5" ry="7" />
      <path d="M12 6v14" />
      <path d="M8 10c2 2 4 2 4 2s2 0 4-2" />
    </svg>
  ),
}

/**
 * Maps grain slugs to icon keys. Slugs match lib/constants/grains.ts.
 */
const SLUG_TO_ICON: Record<string, string> = {
  wheat: "wheat",
  "amber-durum": "durum",
  durum: "durum",
  canola: "canola",
  barley: "barley",
  oats: "oats",
  peas: "pulse",
  lentils: "pulse",
  "chick-peas": "pulse",
  chickpeas: "pulse",
  beans: "pulse",
  corn: "corn",
  soybeans: "soybeans",
  flaxseed: "flaxseed",
  rye: "rye",
  "mustard-seed": "mustard",
  "sunflower-seed": "sunflower",
  sunflower: "sunflower",
  canaryseed: "canaryseed",
}

/**
 * Fuzzy fallback for grain names that don't match a known slug.
 */
function resolveIcon(grain: string): string {
  // Direct slug match
  const direct = SLUG_TO_ICON[grain.toLowerCase()]
  if (direct) return direct

  // Fuzzy match on substrings
  const lower = grain.toLowerCase()
  if (lower.includes("wheat")) return "wheat"
  if (lower.includes("durum")) return "durum"
  if (lower.includes("canola")) return "canola"
  if (lower.includes("barley")) return "barley"
  if (lower.includes("oat")) return "oats"
  if (lower.includes("corn")) return "corn"
  if (lower.includes("soy")) return "soybeans"
  if (lower.includes("flax")) return "flaxseed"
  if (lower.includes("rye")) return "rye"
  if (lower.includes("mustard")) return "mustard"
  if (lower.includes("sunflower")) return "sunflower"
  if (lower.includes("canary")) return "canaryseed"
  if (lower.includes("pea") || lower.includes("lentil") || lower.includes("chick") || lower.includes("bean")) return "pulse"

  return "kernel"
}

export function GrainIcon({ grain, className, size = 24 }: GrainIconProps) {
  const iconKey = resolveIcon(grain)
  const renderIcon = ICONS[iconKey] ?? ICONS.kernel
  return (
    <span className={cn("inline-flex items-center justify-center shrink-0", className)}>
      {renderIcon(size)}
    </span>
  )
}
