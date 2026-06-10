"use client";

import dynamic from "next/dynamic";

import type { DataUniverseModel } from "@/lib/thesis/data-universe";

const DataUniverseScene = dynamic(
  () => import("@/components/dashboard/data-universe-scene").then((mod) => mod.DataUniverseScene),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[420px] items-center justify-center rounded-lg border border-border bg-card text-sm text-muted-foreground sm:h-[560px]">
        Loading the data universe...
      </div>
    ),
  },
);

export function DataUniverseClient({ model }: { model: DataUniverseModel }) {
  return <DataUniverseScene model={model} />;
}
