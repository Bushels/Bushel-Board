export interface GrainDef {
  name: string;
  slug: string;
}

export const ALL_GRAINS: GrainDef[] = [
  { name: "Wheat", slug: "wheat" },
  { name: "Amber Durum", slug: "amber-durum" },
  { name: "Canola", slug: "canola" },
  { name: "Barley", slug: "barley" },
  { name: "Oats", slug: "oats" },
  { name: "Peas", slug: "peas" },
  { name: "Lentils", slug: "lentils" },
  { name: "Flaxseed", slug: "flaxseed" },
  { name: "Soybeans", slug: "soybeans" },
  { name: "Corn", slug: "corn" },
  { name: "Rye", slug: "rye" },
  { name: "Mustard Seed", slug: "mustard-seed" },
  { name: "Canaryseed", slug: "canaryseed" },
  { name: "Chick Peas", slug: "chick-peas" },
  { name: "Sunflower Seed", slug: "sunflower" },
  { name: "Beans", slug: "beans" },
];

export function grainSlug(name: string): string {
  return (
    ALL_GRAINS.find((g) => g.name === name)?.slug ??
    name.toLowerCase().replace(/ /g, "-")
  );
}
