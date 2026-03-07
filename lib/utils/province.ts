const POSTAL_PREFIX_TO_PROVINCE: Record<string, string> = {
  T: "AB",
  S: "SK",
  R: "MB",
  V: "BC",
  K: "ON",
  L: "ON",
  M: "ON",
  N: "ON",
  P: "ON",
};

export function getProvinceFromPostalCode(
  postalCode: string
): string | null {
  if (!postalCode || postalCode.length === 0) return null;
  const firstChar = postalCode.trim().toUpperCase().charAt(0);
  return POSTAL_PREFIX_TO_PROVINCE[firstChar] ?? null;
}

export function getProvinceLabel(code: string): string {
  const labels: Record<string, string> = {
    AB: "Alberta",
    SK: "Saskatchewan",
    MB: "Manitoba",
    BC: "British Columbia",
    ON: "Ontario",
  };
  return labels[code] ?? code;
}
