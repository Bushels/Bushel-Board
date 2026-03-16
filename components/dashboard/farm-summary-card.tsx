import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles } from "lucide-react";
import type { FarmSummary } from "@/lib/queries/intelligence";
import { parseFarmSummary } from "@/lib/utils/farm-summary";
import { ALL_GRAINS } from "@/lib/constants/grains";

const GRAIN_NAMES = new Set(ALL_GRAINS.map((g) => g.name));

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
          const parsedSummary = parseFarmSummary(summary.summary_text);

          return (
            <>
              {parsedSummary.metaTitle && (
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-canola/80">
                  {parsedSummary.metaTitle}
                </p>
              )}

              <div className="space-y-4">
                {parsedSummary.sections.map((section, sectionIndex) => {
                  const isGrainSection = section.title ? GRAIN_NAMES.has(section.title) : false;

                  return (
                  <section
                    key={`${section.title ?? "section"}-${sectionIndex}`}
                    className={
                      isGrainSection
                        ? "border-l-2 border-l-canola/40 pl-3 pt-1"
                        : sectionIndex > 0
                          ? "border-t border-border/20 pt-4"
                          : ""
                    }
                  >
                    {section.title && (
                      <h3
                        className={
                          isGrainSection
                            ? "text-sm font-display font-semibold text-foreground"
                            : "text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground"
                        }
                      >
                        {section.title}
                      </h3>
                    )}
                    <div className={section.title ? "mt-2 space-y-2" : "space-y-2"}>
                      {section.blocks.map((block, blockIndex) =>
                        block.type === "bullet" ? (
                          <div
                            key={`${block.text}-${blockIndex}`}
                            className="flex items-start gap-2 text-sm leading-relaxed text-foreground/90"
                          >
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-canola/80" />
                            <p>{block.text}</p>
                          </div>
                        ) : (
                          <p
                            key={`${block.text}-${blockIndex}`}
                            className="text-sm leading-relaxed text-foreground/90"
                          >
                            {block.text}
                          </p>
                        )
                      )}
                    </div>
                  </section>
                  );
                })}
              </div>

              {parsedSummary.sources.length > 0 && (
                <div className="mt-3 border-t border-border/30 pt-2">
                  <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                    Sources
                  </p>
                  <div className="flex flex-col gap-0.5">
                    {parsedSummary.sources.map((source, i) =>
                      source.url ? (
                        <a
                          key={`${source.label}-${i}`}
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-canola/70 hover:text-canola"
                        >
                          {source.label}
                        </a>
                      ) : (
                        <p
                          key={`${source.label}-${i}`}
                          className="text-[11px] text-muted-foreground"
                        >
                          {source.label}
                        </p>
                      )
                    )}
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
