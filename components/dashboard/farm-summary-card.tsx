import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles } from "lucide-react";
import type { FarmSummary } from "@/lib/queries/intelligence";

interface FarmSummaryCardProps {
  summary: FarmSummary | null;
  hasPlans?: boolean;
  hasLoggedDeliveries?: boolean;
}

export function FarmSummaryCard({
  summary,
  hasPlans = false,
  hasLoggedDeliveries = false,
}: FarmSummaryCardProps) {
  if (!summary) {
    const title = !hasPlans
      ? "Add your first crop to unlock your weekly brief"
      : !hasLoggedDeliveries
        ? "Log your first delivery to sharpen your weekly brief"
        : "Your weekly farm brief is getting ready";

    const message = !hasPlans
      ? "Start with one crop on My Farm. Bushel Board unlocks grain-specific AI, delivery pacing, and your weekly farm summary as you add data."
      : !hasLoggedDeliveries
        ? "Your crop plan is live. Log a delivery or rate grain signals next to teach the AI what matters to your farm before Thursday's update."
        : "Keep logging deliveries and rating signals. Your next weekly summary will get more specific as the app learns your farm.";

    return (
      <Card className="border-canola/20 bg-gradient-to-br from-canola/8 to-background shadow-[0_18px_38px_-26px_rgba(42,38,30,0.45)]">
        <CardContent className="py-8 text-center">
          <Sparkles className="mx-auto mb-3 h-8 w-8 text-canola" />
          <p className="font-display text-lg font-semibold text-foreground">
            {title}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {message}
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
          const parts = summary.summary_text.split(/\n*Sources?:\n*/i);
          const rawNarrative = parts[0].trim();
          const sourcesRaw = parts[1]?.trim();

          const inlineCiteRegex = /\[\[(\d+)\]\]\((https?:\/\/[^\s)]+)\)/g;
          const inlineUrls: string[] = [];
          let match;
          while ((match = inlineCiteRegex.exec(rawNarrative)) !== null) {
            if (!inlineUrls.includes(match[2])) inlineUrls.push(match[2]);
          }

          const narrative = rawNarrative
            .replace(inlineCiteRegex, "")
            .replace(/\s{2,}/g, " ")
            .trim();

          const sourceLines = sourcesRaw
            ? sourcesRaw.split("\n").filter(Boolean)
            : inlineUrls.map((url, i) => `[${i + 1}] ${url}`);

          return (
            <>
              <p className="text-sm leading-relaxed text-foreground/90">
                {narrative}
              </p>
              {sourceLines.length > 0 && (
                <div className="mt-3 border-t border-border/30 pt-2">
                  <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                    Sources
                  </p>
                  <div className="flex flex-col gap-0.5">
                    {sourceLines.map((line, i) => {
                      const urlMatch = line.match(/https?:\/\/[^\s)]+/);
                      return (
                        <a
                          key={i}
                          href={urlMatch?.[0] ?? "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="truncate text-[11px] text-canola/70 hover:text-canola"
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
