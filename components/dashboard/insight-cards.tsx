interface Insight {
  signal: "bullish" | "bearish" | "watch";
  title: string;
  body: string;
}

const signalConfig = {
  bullish: { icon: "\u{1F7E2}", border: "border-t-prairie", bg: "bg-prairie/5" },
  bearish: { icon: "\u{1F534}", border: "border-t-error", bg: "bg-error/5" },
  watch:   { icon: "\u{1F7E1}", border: "border-t-canola", bg: "bg-canola/5" },
};

export function InsightCards({ insights }: { insights: Insight[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {insights.map((insight, i) => {
        const cfg = signalConfig[insight.signal] ?? signalConfig.watch;
        return (
          <div
            key={i}
            className={`rounded-lg border border-border ${cfg.border} border-t-2 ${cfg.bg} p-4 space-y-2`}
          >
            <p className="text-lg">{cfg.icon}</p>
            <h4 className="text-sm font-semibold text-foreground">{insight.title}</h4>
            <p className="text-xs leading-relaxed text-muted-foreground">{insight.body}</p>
          </div>
        );
      })}
    </div>
  );
}
