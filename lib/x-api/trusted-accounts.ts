export type SourceCredTier = "tier1" | "tier2" | "tier3" | "tier4" | "unlisted";

export interface TrustedAccount {
  handle: string;
  tier: Exclude<SourceCredTier, "unlisted">;
  label: string;
  boost: number;
}

const TRUSTED_ACCOUNTS: TrustedAccount[] = [
  { handle: "realagriculture", tier: "tier1", label: "Prairie grain alpha", boost: 30 },
  { handle: "GrainsGorilla", tier: "tier1", label: "Prairie grain alpha", boost: 30 },
  { handle: "ksetzergrains", tier: "tier1", label: "Prairie grain alpha", boost: 30 },
  { handle: "GoddessofGrain", tier: "tier1", label: "Prairie grain alpha", boost: 30 },
  { handle: "StandardGrain", tier: "tier1", label: "Prairie grain alpha", boost: 30 },
  { handle: "LeftFieldCR", tier: "tier1", label: "Prairie grain alpha", boost: 30 },
  { handle: "ArlanFF101", tier: "tier1", label: "Prairie grain alpha", boost: 30 },
  { handle: "GrainStats", tier: "tier1", label: "Prairie grain alpha", boost: 30 },
  { handle: "AgNews", tier: "tier2", label: "Ag media and reporting", boost: 15 },
  { handle: "agripulse", tier: "tier2", label: "Ag media and reporting", boost: 15 },
  { handle: "AgriMarketing", tier: "tier2", label: "Ag media and reporting", boost: 15 },
  { handle: "agritalk", tier: "tier2", label: "Ag media and reporting", boost: 15 },
  { handle: "AgweekMagazine", tier: "tier2", label: "Ag media and reporting", boost: 15 },
  { handle: "dtnpf", tier: "tier2", label: "Ag media and reporting", boost: 15 },
  { handle: "FarmBureau", tier: "tier2", label: "Ag media and reporting", boost: 15 },
  { handle: "FarmIndustryNew", tier: "tier2", label: "Ag media and reporting", boost: 15 },
  { handle: "FarmJournal", tier: "tier2", label: "Ag media and reporting", boost: 15 },
  { handle: "FarmsNews", tier: "tier2", label: "Ag media and reporting", boost: 15 },
  { handle: "FertilizerWeek1", tier: "tier2", label: "Ag media and reporting", boost: 15 },
  { handle: "GRAINSOILSEEDS", tier: "tier2", label: "Ag media and reporting", boost: 15 },
  { handle: "profarmer", tier: "tier2", label: "Ag media and reporting", boost: 15 },
  { handle: "ReutersAg", tier: "tier2", label: "Ag media and reporting", boost: 15 },
  { handle: "RyanBonnett1", tier: "tier2", label: "Ag media and reporting", boost: 15 },
  { handle: "sizov_andre", tier: "tier2", label: "Ag media and reporting", boost: 15 },
  { handle: "SuccessfulFarm", tier: "tier2", label: "Ag media and reporting", boost: 15 },
  { handle: "USFarmReport", tier: "tier2", label: "Ag media and reporting", boost: 15 },
  { handle: "usgrainscouncil", tier: "tier2", label: "Ag media and reporting", boost: 15 },
  { handle: "IGCgrains", tier: "tier3", label: "Policy, weather, or official", boost: 20 },
  { handle: "kannbwx", tier: "tier3", label: "Policy, weather, or official", boost: 20 },
  { handle: "NOAADrought", tier: "tier3", label: "Policy, weather, or official", boost: 20 },
  { handle: "SaskWheat", tier: "tier3", label: "Policy, weather, or official", boost: 20 },
  { handle: "USDA", tier: "tier3", label: "Policy, weather, or official", boost: 20 },
  { handle: "usdaFSA", tier: "tier3", label: "Policy, weather, or official", boost: 20 },
  { handle: "USDAFoodSafety", tier: "tier3", label: "Policy, weather, or official", boost: 20 },
  { handle: "Asgrow_DEKALB", tier: "tier4", label: "Inputs, tech, seed, or equipment", boost: 5 },
  { handle: "BayerTraits", tier: "tier4", label: "Inputs, tech, seed, or equipment", boost: 5 },
  { handle: "Case_IH", tier: "tier4", label: "Inputs, tech, seed, or equipment", boost: 5 },
  { handle: "JohnDeere", tier: "tier4", label: "Inputs, tech, seed, or equipment", boost: 5 },
  { handle: "PioneerSeeds", tier: "tier4", label: "Inputs, tech, seed, or equipment", boost: 5 },
  { handle: "gaurav_kochar", tier: "tier4", label: "Inputs, tech, seed, or equipment", boost: 5 },
];

const ACCOUNT_BY_HANDLE = new Map(
  TRUSTED_ACCOUNTS.map((account) => [account.handle.toLowerCase(), account]),
);

export function normalizeHandle(handle: string): string {
  return handle.trim().replace(/^@/, "");
}

export function getTrustedAccount(handle: string): TrustedAccount | null {
  return ACCOUNT_BY_HANDLE.get(normalizeHandle(handle).toLowerCase()) ?? null;
}

export function getSourceCredTier(handle: string): SourceCredTier {
  return getTrustedAccount(handle)?.tier ?? "unlisted";
}

export function sourceTierBoost(handle: string): number {
  return getTrustedAccount(handle)?.boost ?? 0;
}

export function trustedAccountsByTier(tier: Exclude<SourceCredTier, "unlisted">): TrustedAccount[] {
  return TRUSTED_ACCOUNTS.filter((account) => account.tier === tier);
}

export function groupAllowedHandles(maxHandles = 20): string[][] {
  const groups: string[][] = [];
  for (let i = 0; i < TRUSTED_ACCOUNTS.length; i += maxHandles) {
    groups.push(TRUSTED_ACCOUNTS.slice(i, i + maxHandles).map((account) => account.handle));
  }
  return groups;
}

export function trustedHandleList(): string[] {
  return TRUSTED_ACCOUNTS.map((account) => account.handle);
}
