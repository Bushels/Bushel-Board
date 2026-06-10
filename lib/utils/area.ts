export const AREA_FSA_COOKIE = "bushel_area_fsa";

export interface AreaInfo {
  fsa: string;
  province: string | null;
  provinceName: string | null;
}

/** Canada postal-code first letters for the provinces this board covers. */
const FSA_PROVINCE: Record<string, { code: string; name: string }> = {
  T: { code: "AB", name: "Alberta" },
  S: { code: "SK", name: "Saskatchewan" },
  R: { code: "MB", name: "Manitoba" },
  V: { code: "BC", name: "British Columbia" },
};

/**
 * Normalize free-form postal input to a forward sortation area (FSA): the first
 * three characters, uppercased, validated as letter-digit-letter. Returns null
 * for anything that is not a plausible Canadian FSA.
 */
export function normalizeFsaInput(value: string | null | undefined): string | null {
  if (!value) return null;
  const compact = value.replace(/\s+/g, "").toUpperCase().slice(0, 3);
  return /^[A-Z][0-9][A-Z]$/.test(compact) ? compact : null;
}

/** Resolve an FSA to the prairie/BC province it belongs to, or null outside coverage. */
export function areaFromFsa(value: string | null | undefined): AreaInfo | null {
  const fsa = normalizeFsaInput(value);
  if (!fsa) return null;
  const province = FSA_PROVINCE[fsa[0]] ?? null;
  return { fsa, province: province?.code ?? null, provinceName: province?.name ?? null };
}
