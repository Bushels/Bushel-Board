import { SectionStateCard } from "@/components/dashboard/section-state-card";
import { SpringWheatPulsePage } from "@/components/dashboard/spring-wheat-pulse-page";
import { getSpringWheatPulse } from "@/lib/queries/spring-wheat-pulse";
import { safeQuery } from "@/lib/utils/safe-query";

export const dynamic = "force-dynamic";

export default async function SpringWheatSeedingPulseRoute() {
  const cropYear = new Date().getFullYear();
  const result = await safeQuery("spring wheat seeding pulse", () =>
    getSpringWheatPulse(cropYear),
  );

  if (result.error || !result.data) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6">
        <SectionStateCard
          title="Spring Wheat Pulse unavailable"
          message="The Spring Wheat seeding page could not load its source data. Try refreshing in a minute."
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
