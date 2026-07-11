import type { Metadata } from "next";
import Link from "next/link";
import { Bug, CloudRain, Flame, Leaf, ShieldAlert } from "lucide-react";

import { SectionHeader } from "@/components/dashboard/section-header";

export const metadata: Metadata = {
  title: "Environmental - Bushel Board",
  description:
    "Watch-only environmental risk layers for crop moisture, disease, heat, and field conditions.",
};

const watchLayers = [
  {
    title: "Flood / excess moisture",
    description:
      "Observed surface-water, excess-moisture, forecast-risk, and watch acres across Western Canada and the contiguous U.S.",
    href: "/environmental/flood-watch",
    icon: CloudRain,
    status: "Live v0",
  },
  {
    title: "Disease pressure",
    description:
      "Future layer for weather-driven fusarium, rust, sclerotinia, and other regional disease-pressure signals.",
    href: null,
    icon: Bug,
    status: "Planned",
  },
  {
    title: "Heat stress",
    description:
      "Future layer for crop-stage heat risk, canopy stress, and yield-impact watch windows.",
    href: null,
    icon: Flame,
    status: "Planned",
  },
  {
    title: "Drought / drydown",
    description:
      "Future layer for soil-moisture deficits, drydown speed, and harvest or establishment risk.",
    href: null,
    icon: Leaf,
    status: "Planned",
  },
];

export default function EnvironmentalPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Environmental
        </p>
        <h1 className="font-display text-3xl font-bold sm:text-4xl">
          Environmental crop-risk watches
        </h1>
        <p className="max-w-3xl text-base leading-7 text-muted-foreground">
          Watch-only layers for weather and field-condition risks that can change crop quality,
          access, yield expectations, and market pressure.{" "}
          <span className="font-medium text-foreground">
            These are acres at risk and decision-support signals, not confirmed loss or damage.
          </span>
        </p>
      </div>

      <section className="space-y-3">
        <SectionHeader
          title="Watch layers"
          subtitle="Start with water risk; add disease, heat, and drought once each source proves signal."
        />
        <div className="grid gap-3 md:grid-cols-2">
          {watchLayers.map((layer) => {
            const Icon = layer.icon;
            const content = (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-amber/25 bg-amber/10 p-2 text-amber">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div>
                      <h2 className="font-display text-lg font-semibold">{layer.title}</h2>
                      <p className="mt-0.5 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        {layer.status}
                      </p>
                    </div>
                  </div>
                  {layer.href ? (
                    <span className="rounded-full border border-prairie/25 bg-prairie/10 px-2.5 py-1 text-xs font-semibold text-prairie">
                      Open
                    </span>
                  ) : (
                    <span className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                      Later
                    </span>
                  )}
                </div>
                <p className="mt-4 text-sm leading-6 text-muted-foreground">{layer.description}</p>
              </>
            );

            return layer.href ? (
              <Link
                key={layer.title}
                href={layer.href}
                className="rounded-lg border border-border bg-card/80 p-4 transition-colors hover:border-amber/45 hover:bg-card"
              >
                {content}
              </Link>
            ) : (
              <div key={layer.title} className="rounded-lg border border-border bg-muted/20 p-4">
                {content}
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-muted/20 p-5">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber" />
          <div>
            <h2 className="font-display text-lg font-semibold">Public claim boundary</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Environmental layers must stay labelled as watches until ground truth supports a
              stronger claim. Public wet and dry reports can calibrate the model, but they should not
              automatically convert a watch acre into a confirmed damaged acre.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
