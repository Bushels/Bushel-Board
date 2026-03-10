import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles } from "lucide-react";
import type { FarmSummary } from "@/lib/queries/intelligence";

interface FarmSummaryCardProps {
  summary: FarmSummary | null;
}

export function FarmSummaryCard({ summary }: FarmSummaryCardProps) {
  if (!summary) {
    return (
      <Card className="border-dashed border-canola/30 bg-canola/5">
        <CardContent className="py-8 text-center">
          <Sparkles className="h-8 w-8 text-canola mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            Your personalized farm summary will appear here after the next weekly data update.
            Log deliveries in your active crops to get started.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-canola/20 bg-gradient-to-br from-canola/5 to-transparent">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-display flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-canola" />
          Your Weekly Farm Summary
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Week {summary.grain_week} · {summary.crop_year}
        </p>
      </CardHeader>
      <CardContent>
        {(() => {
          // Split on "Sources:" section if present (new prompt format)
          const parts = summary.summary_text.split(/\n*Sources?:\n*/i);
          const rawNarrative = parts[0].trim();
          const sourcesRaw = parts[1]?.trim();

          // Extract inline citations from legacy format: [[N]](url)
          const inlineCiteRegex = /\[\[(\d+)\]\]\((https?:\/\/[^\s)]+)\)/g;
          const inlineUrls: string[] = [];
          let match;
          while ((match = inlineCiteRegex.exec(rawNarrative)) !== null) {
            if (!inlineUrls.includes(match[2])) inlineUrls.push(match[2]);
          }

          // Strip inline citations from narrative text
          const narrative = rawNarrative.replace(inlineCiteRegex, "").replace(/\s{2,}/g, " ").trim();

          // Combine: prefer explicit Sources section, fall back to extracted inline URLs
          const sourceLines = sourcesRaw
            ? sourcesRaw.split("\n").filter(Boolean)
            : inlineUrls.map((url, i) => `[${i + 1}] ${url}`);

          return (
            <>
              <p className="text-sm leading-relaxed text-foreground/90">
                {narrative}
              </p>
              {sourceLines.length > 0 && (
                <div className="mt-3 pt-2 border-t border-border/30">
                  <p className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider mb-1">Sources</p>
                  <div className="flex flex-col gap-0.5">
                    {sourceLines.map((line, i) => {
                      const urlMatch = line.match(/https?:\/\/[^\s)]+/);
                      return (
                        <a
                          key={i}
                          href={urlMatch?.[0] ?? "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-canola/70 hover:text-canola truncate"
                        >
                          [{i + 1}] {urlMatch?.[0] || line}
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          );
        })()}
      </CardContent>
    </Card>
  );
}
