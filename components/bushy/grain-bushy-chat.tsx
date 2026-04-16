"use client";

import { BushyChat } from "./bushy-chat";
import { SectionBoundary } from "@/components/dashboard/section-boundary";

interface GrainBushyChatProps {
  grainName: string;
  grainWeek: number;
}

export function GrainBushyChat({ grainName, grainWeek }: GrainBushyChatProps) {
  return (
    <SectionBoundary
      title="Chat unavailable"
      message="Bushy Chat is temporarily unavailable."
    >
      <div
        className="rounded-xl border border-border/60 bg-card overflow-hidden"
        style={{ height: 400 }}
      >
        <BushyChat grainContext={{ grain: grainName, grainWeek }} />
      </div>
    </SectionBoundary>
  );
}
