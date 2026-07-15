/**
 * Pure builders for Wheat cockpit visual pillars (Phase 1).
 * Server page will call these; keep free of React and server-only modules.
 */

import {
  beltLabel,
  stressColor,
  type CropStressMapData,
} from "@/lib/queries/gee-crop-stress-utils";
import type {
  GeeMoistureCardModel,
  PrairiePackageStatus,
  PrairieProgressCardModel,
  PrairieProvincePill,
  PriceBasketCardModel,
  PriceBasketLegModel,
} from "@/lib/thesis/wheat-cockpit-models";

const PROVINCE_ORDER = ["MB", "SK", "AB"] as const;

export function packageStatusLabel(status: PrairiePackageStatus): string {
  switch (status) {
    case "complete_mb_sk_ab":
      return "Full Prairie package";
    case "partial_prairie_week":
      return "Partial Prairie package";
    case "partial_mb_only":
      return "Manitoba only so far";
    case "empty":
      return "No Prairie package yet";
    default:
      return "Prairie status unknown";
  }
}

export function buildPrairieProgressCardModel(input: {
  weekEnding?: string | null;
  packageStatus?: string | null;
  /** Optional per-province progress 0–100 and detail lines. */
  provinceHints?: Partial<
    Record<"MB" | "SK" | "AB", { progressPct?: number | null; detail?: string | null; present?: boolean }>
  >;
}): PrairieProgressCardModel {
  const raw = (input.packageStatus ?? "unknown") as PrairiePackageStatus;
  const packageStatus: PrairiePackageStatus = [
    "complete_mb_sk_ab",
    "partial_prairie_week",
    "partial_mb_only",
    "unknown",
    "empty",
  ].includes(raw)
    ? raw
    : "unknown";

  const presentByDefault =
    packageStatus === "complete_mb_sk_ab"
      ? { MB: true, SK: true, AB: true }
      : packageStatus === "partial_mb_only"
        ? { MB: true, SK: false, AB: false }
        : packageStatus === "partial_prairie_week"
          ? { MB: true, SK: true, AB: false }
          : { MB: false, SK: false, AB: false };

  const provinces: PrairieProvincePill[] = PROVINCE_ORDER.map((code) => {
    const hint = input.provinceHints?.[code];
    const present = hint?.present ?? presentByDefault[code];
    return {
      code,
      label: code === "MB" ? "Manitoba" : code === "SK" ? "Saskatchewan" : "Alberta",
      progressPct: present ? (hint?.progressPct ?? null) : null,
      detail: present ? (hint?.detail ?? null) : "Waiting on this province's report",
      present,
    };
  });

  let takeaway = "Prairie crop reports land mid-week: Manitoba first, then Saskatchewan, Alberta last.";
  if (packageStatus === "complete_mb_sk_ab") {
    takeaway = "All three Prairie provinces are in for this package — use this as the Canada crop-progress read.";
  } else if (packageStatus === "partial_prairie_week" || packageStatus === "partial_mb_only") {
    takeaway = "Prairie package is still filling in. Don't treat a partial week like a finished Canada read.";
  } else if (packageStatus === "empty") {
    takeaway = "No current Prairie crop-progress package yet this cycle.";
  }

  return {
    weekEnding: input.weekEnding ?? null,
    packageStatus,
    packageLabel: packageStatusLabel(packageStatus),
    takeaway,
    provinces,
  };
}

export function buildGeeMoistureCardModel(data: CropStressMapData | null): GeeMoistureCardModel {
  if (!data || !data.beltSummaries.length) {
    return {
      latestWeek: null,
      takeaway: "Satellite crop-stress isn't loaded yet — check Wheat Data after Friday's GEE run.",
      belts: [],
      watchOnly: true,
      dataHref: "/data",
    };
  }

  const belts = data.beltSummaries.map((b) => ({
    cropBelt: b.cropBelt,
    label: beltLabel(b.cropBelt).replace(/^the /i, "").replace(/^Russia's /i, "Russia "),
    stressIndex: b.stressIndex,
    reading: b.reading,
    color: stressColor(b.stressIndex),
  }));

  return {
    latestWeek: data.latestWeek,
    takeaway: data.takeaway,
    belts,
    watchOnly: true,
    dataHref: "/data",
  };
}

export function buildPriceBasketCardModel(legs: PriceBasketLegModel[]): PriceBasketCardModel {
  const withChange = legs.filter((l) => l.changePct != null);
  let agreementLabel = "Price context";
  let takeaway = "Futures confirm the official read — they do not override supply or desk truth alone.";

  if (withChange.length >= 2) {
    const signs = withChange.map((l) => Math.sign(l.changePct as number));
    const allUp = signs.every((s) => s > 0);
    const allDown = signs.every((s) => s < 0);
    if (allUp) {
      agreementLabel = "Contracts agree ↑";
      takeaway = "Spring, HRW, and SRW are moving together higher — price confirmation leans constructive.";
    } else if (allDown) {
      agreementLabel = "Contracts agree ↓";
      takeaway = "The three Wheat classes are softer together — price confirmation leans cautious.";
    } else {
      agreementLabel = "Contracts split";
      takeaway = "Wheat classes disagree on direction — treat price as lower-confidence confirmation only.";
    }
  }

  return { legs, agreementLabel, takeaway };
}
