export interface GrainDef {
  name: string;
  slug: string;
  defaultBushelWeightLbs: number;
}

export const ALL_GRAINS: GrainDef[] = [
  { name: "Wheat", slug: "wheat", defaultBushelWeightLbs: 60 },
  { name: "Amber Durum", slug: "amber-durum", defaultBushelWeightLbs: 60 },
  { name: "Canola", slug: "canola", defaultBushelWeightLbs: 50 },
  { name: "Barley", slug: "barley", defaultBushelWeightLbs: 48 },
  { name: "Oats", slug: "oats", defaultBushelWeightLbs: 34 },
  { name: "Peas", slug: "peas", defaultBushelWeightLbs: 60 },
  { name: "Lentils", slug: "lentils", defaultBushelWeightLbs: 60 },
  { name: "Flaxseed", slug: "flaxseed", defaultBushelWeightLbs: 56 },
  { name: "Soybeans", slug: "soybeans", defaultBushelWeightLbs: 60 },
  { name: "Corn", slug: "corn", defaultBushelWeightLbs: 56 },
  { name: "Rye", slug: "rye", defaultBushelWeightLbs: 56 },
  { name: "Mustard Seed", slug: "mustard-seed", defaultBushelWeightLbs: 50 },
  { name: "Canaryseed", slug: "canaryseed", defaultBushelWeightLbs: 50 },
  { name: "Chick Peas", slug: "chick-peas", defaultBushelWeightLbs: 60 },
  { name: "Sunflower", slug: "sunflower", defaultBushelWeightLbs: 30 },
  { name: "Beans", slug: "beans", defaultBushelWeightLbs: 60 },
];

export function grainSlug(name: string): string {
  return (
    ALL_GRAINS.find((g) => g.name === name)?.slug ??
    name.toLowerCase().replace(/ /g, "-")
  );
}

export function getGrainDef(name: string): GrainDef | undefined {
  return ALL_GRAINS.find((grain) => grain.name === name);
}
