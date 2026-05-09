import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  DatabaseZap,
  FileSearch,
  Map,
  Satellite,
  Sprout,
  TrainFront,
  Waves,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type LaneStatus = "Admitted" | "Watch next" | "Research" | "Deferred";
type BuildTone = "green" | "amber" | "blue" | "neutral";

interface BuildCard {
  label: string;
  value: string;
  detail: string;
  tone: BuildTone;
}

interface SourceLane {
  sourceId: string;
  name: string;
  icon: LucideIcon;
  status: LaneStatus;
  cadence: string;
  bestUse: string;
  v1Decision: string;
  risk: string;
  sourceLinks: Array<{
    label: string;
    href: string;
  }>;
}

interface CoreSourceLane {
  sourceId: string;
  name: string;
  icon: LucideIcon;
  status: LaneStatus;
  cadence: string;
  controls: string;
  whyFirst: string;
  guardrail: string;
}

const buildCards: BuildCard[] = [
  {
    label: "Current read",
    value: "Canola V1",
    detail:
      "Deterministic output from get_canada_thesis_packet('Canola', ...). No LLM thesis prose.",
    tone: "green",
  },
  {
    label: "Source truth",
    value: "Live packet RPC",
    detail:
      "Facts, warnings, stale rows, empty rows, and proxy rows stay visible before interpretation.",
    tone: "blue",
  },
  {
    label: "Run ledger",
    value: "Waiting",
    detail:
      "source_runs exists, but collectors still need to write run summaries before health can roll up.",
    tone: "amber",
  },
  {
    label: "Weekly spine",
    value: "CGC first",
    detail:
      "CGC movement data drives the Canada market read before slower compiled or map-derived sources.",
    tone: "green",
  },
];

const coreSourceLanes: CoreSourceLane[] = [
  {
    sourceId: "cgc_weekly_stats",
    name: "Canadian Grain Commission weekly statistics",
    icon: DatabaseZap,
    status: "Admitted",
    cadence: "Weekly, after the CGC Thursday publication.",
    controls:
      "Deliveries, shipments, terminal receipts, terminal exports, stocks, producer cars, process rows, grades, regions, crop year, grain week.",
    whyFirst:
      "This is the Canada movement anchor. It tells us what is actually flowing before we interpret acres, drought, or farmer behavior.",
    guardrail:
      "Use the canonical packet/RPC rows, not stale market_analysis prose. Show week, crop year, units, and missing worksheets.",
  },
  {
    sourceId: "grain_monitor_weekly",
    name: "Grain Monitor weekly logistics report",
    icon: Activity,
    status: "Admitted",
    cadence: "Weekly, with natural lag versus current CGC week.",
    controls:
      "Port unloads, vessel timing, grain-in-store, rail performance, corridor capacity, logistics pressure.",
    whyFirst:
      "It explains why CGC movement is happening, especially when export pace looks weak but the real issue is unloads, vessels, or rail.",
    guardrail:
      "Preserve report date and lag. Do not smooth it into the same week as CGC if the source is behind.",
  },
  {
    sourceId: "cgc_producer_cars",
    name: "Producer cars and railcar staging",
    icon: TrainFront,
    status: "Admitted",
    cadence: "Weekly, Thursday schedule after CGC movement data.",
    controls:
      "Producer-car allocations, shipments, destinations, and farmer-direct rail pressure.",
    whyFirst:
      "This is one of the cleanest ways to see farmer-direct logistics pressure outside the elevator channel.",
    guardrail:
      "Producer-car rows are cumulative and forward-looking in places. Treat worksheet and metric names exactly.",
  },
  {
    sourceId: "cftc_cot",
    name: "CFTC Commitments of Traders",
    icon: BarChart3,
    status: "Admitted",
    cadence: "Weekly Friday release for Tuesday positioning.",
    controls:
      "Managed money, commercial hedging, net position, week-over-week positioning pressure.",
    whyFirst:
      "It gives futures positioning context, which matters when cash movement and futures reaction diverge.",
    guardrail:
      "Canola is direct only where mapping is direct. Proxy mappings must stay labelled and cannot carry the same confidence.",
  },
  {
    sourceId: "aafc_statscan_supply",
    name: "AAFC / StatsCan supply-disposition and crop size",
    icon: FileSearch,
    status: "Watch next",
    cadence: "Periodic through intentions, seeded area, model estimates, and final production.",
    controls:
      "Seeded acres, harvested acres, yield, production, imports, exports, domestic use, carryout, stocks-to-use.",
    whyFirst:
      "This sets the season-size baseline, but it is not the weekly flow source. A lot of the grain movement truth still rolls back to CGC.",
    guardrail:
      "Label survey/model/outlook/final status. Do not treat compiled annual values as fresher than CGC weekly movement.",
  },
];

const sourceLanes: SourceLane[] = [
  {
    sourceId: "aafc_canadian_drought_monitor",
    name: "Canadian Drought Monitor",
    icon: Map,
    status: "Watch next",
    cadence:
      "Monthly. AAFC metadata says usually by the 10th for the previous month.",
    bestUse:
      "Official drought-class benchmark for prairie yield risk and public-source traceability.",
    v1Decision:
      "Good benchmark, not live enough for V1 stress detection. Show lag explicitly if displayed.",
    risk:
      "Consensus product, not a raw sensor feed. It can confirm the big picture but will miss fast changes.",
    sourceLinks: [
      {
        label: "AAFC CDM ArcGIS service",
        href: "https://agriculture.canada.ca/imagery-images/rest/services/canadian_drought_monitor/ImageServer",
      },
    ],
  },
  {
    sourceId: "aafc_agroclimate_maps",
    name: "AAFC Agroclimate maps",
    icon: Activity,
    status: "Watch next",
    cadence:
      "Near-real-time weather observations are assembled within about 12 hours, then mapped as rolling or fixed time frames.",
    bestUse:
      "Precipitation, temperature, GDD, SPI, SPEI, soil moisture, and drought-index context.",
    v1Decision:
      "Useful next source family, but it is a weather lane. Do not let it into Canola V1 until one layer is admitted cleanly.",
    risk:
      "Large family of layers. Each map needs its own units, time window, geography, and failure mode.",
    sourceLinks: [
      {
        label: "AAFC Agroclimate maps",
        href: "https://agriculture.canada.ca/atlas/apps/aef/agclimate/index_en.html?AGRIAPP=18",
      },
      {
        label: "How AAFC builds agroclimate maps",
        href: "https://agriculture.canada.ca/en/agricultural-production/weather/agroclimate-maps/about-agroclimate-maps",
      },
    ],
  },
  {
    sourceId: "aafc_vegdri",
    name: "Vegetation Drought Response Index",
    icon: Sprout,
    status: "Research",
    cadence:
      "AAFC service describes weekly creation at 1 km resolution from MODIS NDVI, SPI, and static landscape inputs.",
    bestUse:
      "A stronger crop-stress layer than raw NDVI because it tries to isolate drought-driven vegetation stress.",
    v1Decision:
      "Promising, but not admitted. The AAFC image service metadata observed on 2026-05-04 ended at 2025-08-30, so freshness must be solved first.",
    risk:
      "If stale, it is a historical benchmark only. If rebuilt in GEE, it becomes a derived proxy and must be labelled that way.",
    sourceLinks: [
      {
        label: "AAFC VegDRI image service",
        href: "https://agriculture.canada.ca/imagery-images/rest/services/vegetation_drought_response_index/ImageServer",
      },
      {
        label: "AAFC VegDRI Canada research summary",
        href: "https://profils-profiles.science.gc.ca/en/publication/building-vegetation-drought-response-index-canada-vegdri-canada-monitor-agricultural",
      },
    ],
  },
  {
    sourceId: "aafc_smos_soil_moisture",
    name: "Satellite soil moisture",
    icon: Waves,
    status: "Watch next",
    cadence:
      "Created daily from SMOS passive microwave data and averaged weekly, biweekly, or monthly.",
    bestUse:
      "Surface-layer moisture anomaly for drought, waterlogging, seeding conditions, and early yield-risk context.",
    v1Decision:
      "Best AAFC satellite candidate after acres/production. Start as a map/read-only signal, not a thesis driver.",
    risk:
      "Coarse 0.25 degree grid and top-of-soil signal. Quality flags remove rain, snow, and radio-frequency interference.",
    sourceLinks: [
      {
        label: "AAFC soil moisture image service",
        href: "https://agriculture.canada.ca/imagery-images/rest/services/percent_saturated_surface_soil_moisture/biweekly_anomaly/ImageServer",
      },
      {
        label: "Open Canada dataset",
        href: "https://open.canada.ca/data/en/dataset/c0ea8c27-e62e-45bc-b64c-d475650d84a2",
      },
    ],
  },
  {
    sourceId: "nasa_servir_esi",
    name: "Evaporative Stress Index",
    icon: Satellite,
    status: "Research",
    cadence:
      "NASA/SERVIR products are commonly distributed as 4-week and 12-week ESI rasters.",
    bestUse:
      "Fast drought stress warning from evapotranspiration anomalies and land-surface-temperature behavior.",
    v1Decision:
      "Useful early-warning proxy, but not AAFC. Keep outside Canola V1 until Canadian coverage, cadence, and access are proven.",
    risk:
      "Strong for flash drought, but source family, coverage, and raster access path must be pinned before farmer-facing use.",
    sourceLinks: [
      {
        label: "Drought.gov ESI data page",
        href: "https://www.drought.gov/data-maps-tools/evaporative-stress-index-esi",
      },
      {
        label: "SERVIR ESI downloads",
        href: "https://gis1.servirglobal.net/data/esi/",
      },
    ],
  },
  {
    sourceId: "gee_derived_drought_stack",
    name: "GEE derived drought stack",
    icon: DatabaseZap,
    status: "Deferred",
    cadence:
      "Depends on the chosen ingredients: MODIS NDVI is 16-day, MODIS LST is daily, SMAP/SMOS-style soil moisture is coarse but frequent.",
    bestUse:
      "A closer-to-live proxy layer that can sit beside AAFC official products and flag stress before monthly maps catch up.",
    v1Decision:
      "Build later as a derived source with formulas and validation, not as a substitute for official AAFC/StatsCan records.",
    risk:
      "Derived models can look authoritative while being wrong. They need back-testing against AAFC drought classes and yield outcomes.",
    sourceLinks: [
      {
        label: "GEE MODIS NDVI catalog",
        href: "https://developers.google.com/earth-engine/datasets/catalog/MODIS_061_MOD13Q1",
      },
      {
        label: "GEE MODIS LST catalog",
        href: "https://developers.google.com/earth-engine/datasets/catalog/MODIS_061_MOD11A1",
      },
      {
        label: "NASA-USDA soil moisture in GEE",
        href: "https://earth.gsfc.nasa.gov/hydro/data/nasa-usda-global-soil-moisture-data",
      },
    ],
  },
];

const statusClasses: Record<LaneStatus, string> = {
  Admitted:
    "border-prairie/30 bg-prairie/10 text-prairie dark:border-prairie/35 dark:bg-prairie/15",
  "Watch next":
    "border-canola/35 bg-canola/12 text-canola dark:border-canola/40 dark:bg-canola/15",
  Research:
    "border-sky-500/25 bg-sky-500/10 text-sky-800 dark:border-sky-300/25 dark:bg-sky-300/10 dark:text-sky-100",
  Deferred:
    "border-muted-foreground/20 bg-muted/55 text-muted-foreground",
};

const toneClasses: Record<BuildTone, string> = {
  green:
    "border-prairie/25 bg-prairie/8 text-prairie dark:border-prairie/30 dark:bg-prairie/12",
  amber:
    "border-canola/30 bg-canola/10 text-canola dark:border-canola/40 dark:bg-canola/12",
  blue:
    "border-sky-500/25 bg-sky-500/10 text-sky-800 dark:border-sky-300/25 dark:bg-sky-300/10 dark:text-sky-100",
  neutral:
    "border-border bg-white/65 text-foreground dark:bg-white/5",
};

export default function SourceSpinePage() {
  return (
    <div className="mx-auto max-w-7xl pb-12 pt-8">
      <section className="mb-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <Badge
            variant="outline"
            className="mb-4 border-canola/35 bg-canola/8 text-canola"
          >
            Canola source watch
          </Badge>
          <h1 className="max-w-4xl font-display text-3xl font-semibold tracking-normal text-foreground md:text-5xl">
            Build the read from admitted facts. Watch everything else.
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
            This is the source board for Sprint 1. It separates official facts,
            interpretation candidates, and derived proxies before anything reaches
            a farmer-facing market call.
          </p>
        </div>

        <Card className="rounded-lg border-canola/25 bg-canola/8 shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-canola" />
              V1 guardrail
            </CardTitle>
            <CardDescription>
              Climate, satellite, and map layers are not Canola V1 inputs yet.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
            <p>
              Canola V1 can show stale, empty, lagged, and proxy sources. It
              cannot quietly turn those sources into advice.
            </p>
            <p>
              The first market read stays anchored to the live Canola packet RPC
              until each new lane has a source contract and freshness proof.
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="mb-10 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {buildCards.map((card) => (
          <Card
            key={card.label}
            className={cn("rounded-lg py-5 shadow-none", toneClasses[card.tone])}
          >
            <CardHeader className="px-5">
              <CardDescription className="text-xs font-semibold uppercase text-current opacity-75">
                {card.label}
              </CardDescription>
              <CardTitle className="text-2xl font-semibold tabular-nums">
                {card.value}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 text-sm leading-6 text-muted-foreground">
              {card.detail}
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="mb-10">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-display text-2xl font-semibold">
              Core Weekly Spine
            </h2>
            <p className="text-sm text-muted-foreground">
              These sources come before slower compiled releases and map-derived
              stress signals.
            </p>
          </div>
          <Badge variant="outline" className="border-border bg-white/60">
            Canada movement first
          </Badge>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {coreSourceLanes.map((lane) => {
            const Icon = lane.icon;
            return (
              <article
                key={lane.sourceId}
                className="rounded-lg border border-border bg-card p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-canola/20 bg-canola/8 text-canola">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase text-muted-foreground">
                        {lane.sourceId}
                      </p>
                      <h3 className="mt-1 text-lg font-semibold leading-tight">
                        {lane.name}
                      </h3>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn("shrink-0", statusClasses[lane.status])}
                  >
                    {lane.status}
                  </Badge>
                </div>

                <dl className="mt-5 grid gap-4 text-sm md:grid-cols-2">
                  <div>
                    <dt className="flex items-center gap-1.5 font-semibold text-foreground">
                      <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />
                      Cadence
                    </dt>
                    <dd className="mt-1 leading-6 text-muted-foreground">
                      {lane.cadence}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-foreground">
                      Controls
                    </dt>
                    <dd className="mt-1 leading-6 text-muted-foreground">
                      {lane.controls}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-foreground">Why first</dt>
                    <dd className="mt-1 leading-6 text-muted-foreground">
                      {lane.whyFirst}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-foreground">
                      Guardrail
                    </dt>
                    <dd className="mt-1 leading-6 text-muted-foreground">
                      {lane.guardrail}
                    </dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </div>
      </section>

      <section className="mb-10">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-display text-2xl font-semibold">
              Candidate Weather And Satellite Lanes
            </h2>
            <p className="text-sm text-muted-foreground">
              Admission means the lane can affect the read. Watching means it
              can appear as context only.
            </p>
          </div>
          <Badge variant="outline" className="border-border bg-white/60">
            Verified research snapshot: 2026-05-04
          </Badge>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {sourceLanes.map((lane) => {
            const Icon = lane.icon;
            return (
              <article
                key={lane.sourceId}
                className="rounded-lg border border-border bg-card p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-canola/20 bg-canola/8 text-canola">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase text-muted-foreground">
                        {lane.sourceId}
                      </p>
                      <h3 className="mt-1 text-lg font-semibold leading-tight">
                        {lane.name}
                      </h3>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn("shrink-0", statusClasses[lane.status])}
                  >
                    {lane.status}
                  </Badge>
                </div>

                <dl className="mt-5 grid gap-4 text-sm md:grid-cols-2">
                  <div>
                    <dt className="flex items-center gap-1.5 font-semibold text-foreground">
                      <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />
                      Cadence
                    </dt>
                    <dd className="mt-1 leading-6 text-muted-foreground">
                      {lane.cadence}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-foreground">Best use</dt>
                    <dd className="mt-1 leading-6 text-muted-foreground">
                      {lane.bestUse}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-foreground">
                      V1 decision
                    </dt>
                    <dd className="mt-1 leading-6 text-muted-foreground">
                      {lane.v1Decision}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-foreground">
                      Failure mode
                    </dt>
                    <dd className="mt-1 leading-6 text-muted-foreground">
                      {lane.risk}
                    </dd>
                  </div>
                </dl>

                <div className="mt-5 flex flex-wrap gap-2">
                  {lane.sourceLinks.map((link) => (
                    <a
                      key={link.href}
                      href={link.href}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-canola/40 hover:text-canola"
                    >
                      {link.label}
                    </a>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        <Card className="rounded-lg shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <DatabaseZap className="h-5 w-5 text-canola" />
              GEE answer
            </CardTitle>
            <CardDescription>
              Yes, but it should be treated as a derived early-warning lane.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-6 text-muted-foreground">
            <p>
              GEE can help get closer to live drought stress by combining MODIS
              NDVI, MODIS land-surface temperature, SMAP/SMOS-style soil
              moisture, and gridded precipitation. That is useful, but it is a
              model output, not an official source.
            </p>
            <p>
              The clean architecture is official AAFC and StatsCan as the
              benchmark, GEE as the fast proxy, then Canola V1 as the consumer
              only after validation.
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-lg border-prairie/20 bg-prairie/8 shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <CheckCircle2 className="h-5 w-5 text-prairie" />
              Admission test
            </CardTitle>
            <CardDescription>
              A source enters the read only after these are pinned.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
              <li>Official URL or explicit proxy label.</li>
              <li>Cadence, lag, date field, and crop-year mapping.</li>
              <li>Units and geography down to the display level.</li>
              <li>Collector or API path with freshness proof.</li>
              <li>Known failure modes shown in the read, not hidden.</li>
            </ul>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
