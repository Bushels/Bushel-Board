import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtKt } from "@/lib/utils/format";

interface ProvincialData {
  region: string;
  ktonnes: number;
}

const provinceConfig: Record<
  string,
  { abbr: string; color: string }
> = {
  Alberta: { abbr: "AB", color: "bg-province-ab" },
  Saskatchewan: { abbr: "SK", color: "bg-province-sk" },
  Manitoba: { abbr: "MB", color: "bg-province-mb" },
  "British Columbia": { abbr: "BC", color: "bg-province-bc" },
};

export function ProvincialCards({ data }: { data: ProvincialData[] }) {
  const provinces = data.filter((d) => d.region in provinceConfig);
  const total = provinces.reduce((sum, d) => sum + d.ktonnes, 0);

  if (provinces.length === 0) {
    return (
      <div className="rounded-lg border border-border p-8 text-center text-muted-foreground">
        No provincial data available.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {provinces.map((d) => {
        const config = provinceConfig[d.region];
        if (!config) return null;
        const pct = total > 0 ? (d.ktonnes / total) * 100 : 0;

        return (
          <Card key={d.region}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-body flex items-center gap-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${config.color}`}
                />
                {d.region} ({config.abbr})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-semibold tabular-nums">
                {fmtKt(d.ktonnes, 0)}
              </p>
              <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full ${config.color} transition-all duration-700`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {pct.toFixed(1)}% of total
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
