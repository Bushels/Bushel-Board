import floodWatchArtifact from "@/public/data/flood-watch-v0.json";
import { normalizeFloodWatchArtifact, type FloodWatchMapData } from "./flood-watch-utils";

export async function getFloodWatchV0(): Promise<FloodWatchMapData> {
  return normalizeFloodWatchArtifact(floodWatchArtifact as Record<string, unknown>);
}
