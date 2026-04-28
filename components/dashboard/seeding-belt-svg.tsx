// components/dashboard/seeding-belt-svg.tsx
// Stylised US grain-belt outline used as the static backdrop for small-multiples
// mini-maps. Not geographically precise — the goal is "this looks like the
// grain belt" so absolutely-positioned SVG glyphs anchor on top in roughly the
// right spots.
//
// Coordinate system: viewBox 0 0 360 240. Lng [-101, -83] maps to x [0, 360].
// Lat [30, 49] maps to y [240, 0] (inverted). Use lngLatToPercent() in mini-glyph
// callers to compute matching positions.

interface Props {
  className?: string;
  ariaHidden?: boolean;
}

export function SeedingBeltSvg({ className, ariaHidden = true }: Props) {
  return (
    <svg
      viewBox="0 0 360 240"
      preserveAspectRatio="xMidYMid meet"
      className={className}
      aria-hidden={ariaHidden}
    >
      {/* North Dakota */}
      <path
        d="M30 32h54v40H30z"
        fill="#ece8dc"
        stroke="#ddd5c0"
        strokeWidth={1.4}
      />
      {/* South Dakota */}
      <path
        d="M30 76h60v44H30z"
        fill="#ece8dc"
        stroke="#ddd5c0"
        strokeWidth={1.4}
      />
      {/* Nebraska */}
      <path
        d="M30 124h70v36H30z"
        fill="#ece8dc"
        stroke="#ddd5c0"
        strokeWidth={1.4}
      />
      {/* Kansas */}
      <path
        d="M30 164h70v34H30z"
        fill="#ece8dc"
        stroke="#ddd5c0"
        strokeWidth={1.4}
      />
      {/* Texas (just the panhandle/north slice) */}
      <path
        d="M30 202h70v32H30z"
        fill="#ece8dc"
        stroke="#ddd5c0"
        strokeWidth={1.4}
      />
      {/* Minnesota */}
      <path
        d="M88 32h60v54H88z"
        fill="#ece8dc"
        stroke="#ddd5c0"
        strokeWidth={1.4}
      />
      {/* Iowa */}
      <path
        d="M104 90h70v40h-70z"
        fill="#ece8dc"
        stroke="#ddd5c0"
        strokeWidth={1.4}
      />
      {/* Missouri */}
      <path
        d="M104 134h70v44h-70z"
        fill="#ece8dc"
        stroke="#ddd5c0"
        strokeWidth={1.4}
      />
      {/* Arkansas */}
      <path
        d="M118 182h60v34h-60z"
        fill="#ece8dc"
        stroke="#ddd5c0"
        strokeWidth={1.4}
      />
      {/* Wisconsin */}
      <path
        d="M154 32h54v54h-54z"
        fill="#ece8dc"
        stroke="#ddd5c0"
        strokeWidth={1.4}
      />
      {/* Illinois */}
      <path
        d="M180 90h44v60h-44z"
        fill="#ece8dc"
        stroke="#ddd5c0"
        strokeWidth={1.4}
      />
      {/* Kentucky */}
      <path
        d="M186 154h70v28h-70z"
        fill="#ece8dc"
        stroke="#ddd5c0"
        strokeWidth={1.4}
      />
      {/* Michigan */}
      <path
        d="M214 32h60v52h-60z"
        fill="#ece8dc"
        stroke="#ddd5c0"
        strokeWidth={1.4}
      />
      {/* Indiana */}
      <path
        d="M230 90h44v60h-44z"
        fill="#ece8dc"
        stroke="#ddd5c0"
        strokeWidth={1.4}
      />
      {/* Ohio */}
      <path
        d="M280 90h54v62h-54z"
        fill="#ece8dc"
        stroke="#ddd5c0"
        strokeWidth={1.4}
      />
    </svg>
  );
}

/**
 * Linear projection from lng/lat to percent within the SeedingBeltSvg viewBox.
 * Returns percentages so callers can use `style={{ left: ${x}%, top: ${y}% }}`.
 *
 * Lng range -101 → -83 = 18° span → x [0, 100]%.
 * Lat range 30 → 49 = 19° span → y [100, 0]% (inverted for SVG).
 */
export function lngLatToPercent(lng: number, lat: number): {
  x: number;
  y: number;
} {
  const minLng = -101;
  const maxLng = -83;
  const minLat = 30;
  const maxLat = 49;
  const x = ((lng - minLng) / (maxLng - minLng)) * 100;
  const y = (1 - (lat - minLat) / (maxLat - minLat)) * 100;
  return {
    x: Math.max(0, Math.min(100, x)),
    y: Math.max(0, Math.min(100, y)),
  };
}
