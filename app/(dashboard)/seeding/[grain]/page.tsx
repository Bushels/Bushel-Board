import { notFound } from "next/navigation";
import { SectionStateCard } from "@/components/dashboard/section-state-card";
import { SpringWheatPulsePage } from "@/components/dashboard/spring-wheat-pulse-page";
import {
  getSeedingGrainConfig,
  getSeedingPulse,
} from "@/lib/queries/spring-wheat-pulse";
import { safeQuery } from "@/lib/utils/safe-query";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{
    grain: string;
  }>;
}

export default async function SeedingPulseRoute({ params }: Props) {
  const { grain } = await params;
  const config = getSeedingGrainConfig(grain);
  if (!config) notFound();

  const cropYear = new Date().getFullYear();
  const result = await safeQuery(`${config.label} seeding pulse`, () =>
    getSeedingPulse(config.slug, cropYear),
  );

  if (result.error || !result.data) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6">
        <SectionStateCard
          title={`${config.label} Pulse unavailable`}
          message="The seeding pulse page could not load its source data. Try refreshing in a minute."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <SpringWheatPulsePage pulse={result.data} />
    </div>
  );
}
