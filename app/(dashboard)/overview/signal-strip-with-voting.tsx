"use client";

import { CompactSignalStrip, type CompactSignal } from "@/components/dashboard/compact-signal-strip";
import { voteSignalFromOverview } from "./actions";

interface SignalStripWithVotingProps {
  signals: CompactSignal[];
  unlockedSlugs: string[];
  role: "farmer" | "observer";
}

export function SignalStripWithVoting({
  signals,
  unlockedSlugs,
  role,
}: SignalStripWithVotingProps) {
  return (
    <CompactSignalStrip
      signals={signals}
      unlockedSlugs={unlockedSlugs}
      role={role}
      onVote={voteSignalFromOverview}
    />
  );
}
