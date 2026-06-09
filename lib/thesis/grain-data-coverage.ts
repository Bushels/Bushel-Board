import {
  getGrainImpactProfile,
  type GrainImpactFactor,
  type GrainImpactProfile,
  type ImpactScope,
  type ImpactSourceClass,
} from "./grain-impact-map";
import type { RatingDomainId, SupportedRatingGrain } from "./rating-model";

export type GrainDataCoverageStep = "pulled" | "packeted" | "scored" | "explanation_only" | "missing";

export interface GrainDataCoverageChecklist {
  pulled: boolean;
  packeted: boolean;
  scored: boolean;
  explanation_only: boolean;
  missing: boolean;
}

export interface GrainDataCoverageRow {
  id: string;
  label: string;
  domain: RatingDomainId;
  scope: ImpactScope;
  sourceClass: ImpactSourceClass;
  sourceIds: string[];
  currentStep: GrainDataCoverageStep;
  checklist: GrainDataCoverageChecklist;
  bullSignal: string;
  bearSignal: string;
  boundary: string;
  nextAction: string;
}

export interface GrainDataCoverageGap {
  id: string;
  label: string;
  currentStep: "missing";
  checklist: GrainDataCoverageChecklist;
  nextAction: string;
}

export type GrainDataAdmissionPriorityKind = "promote_watch_lane" | "admit_missing_source";

export interface GrainDataAdmissionPriority {
  rank: number;
  id: string;
  label: string;
  kind: GrainDataAdmissionPriorityKind;
  currentStep: "explanation_only" | "missing";
  domain: RatingDomainId | null;
  scope: ImpactScope | null;
  sourceIds: string[];
  whyItMatters: string;
  admissionRequirement: string;
  scoreBoundary: string;
}

export interface GrainDataCoverageProfile {
  grain: SupportedRatingGrain;
  marketShape: GrainImpactProfile["marketShape"];
  marketStructure: string;
  rows: GrainDataCoverageRow[];
  gaps: GrainDataCoverageGap[];
  admissionPriorities: GrainDataAdmissionPriority[];
  summary: {
    scored: number;
    explanationOnly: number;
    missing: number;
    admissionPriorities: number;
  };
}

const CHECKLISTS: Record<GrainDataCoverageStep, GrainDataCoverageChecklist> = {
  pulled: {
    pulled: true,
    packeted: false,
    scored: false,
    explanation_only: false,
    missing: false,
  },
  packeted: {
    pulled: true,
    packeted: true,
    scored: false,
    explanation_only: false,
    missing: false,
  },
  scored: {
    pulled: true,
    packeted: true,
    scored: true,
    explanation_only: false,
    missing: false,
  },
  explanation_only: {
    pulled: true,
    packeted: false,
    scored: false,
    explanation_only: true,
    missing: false,
  },
  missing: {
    pulled: false,
    packeted: false,
    scored: false,
    explanation_only: false,
    missing: true,
  },
};

export function getGrainDataCoverageProfile(grain: string): GrainDataCoverageProfile | null {
  const profile = getGrainImpactProfile(grain);
  if (!profile) return null;

  const rows = profile.impactFactors.map((factor) => dataCoverageRowForFactor(factor));
  const gaps = profile.parkedGaps.map((gap) => ({
    id: `${profile.grain.toLowerCase().replaceAll(" ", "-")}-gap-${gap.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
    label: gap,
    currentStep: "missing" as const,
    checklist: CHECKLISTS.missing,
    nextAction: "Admit a source contract, collector, units, freshness proof, and mapper before it can affect the thesis.",
  }));
  const admissionPriorities = buildAdmissionPriorities(rows, gaps);

  return {
    grain: profile.grain,
    marketShape: profile.marketShape,
    marketStructure: profile.marketStructure,
    rows,
    gaps,
    admissionPriorities,
    summary: {
      scored: rows.filter((row) => row.currentStep === "scored").length,
      explanationOnly: rows.filter((row) => row.currentStep === "explanation_only").length,
      missing: gaps.length,
      admissionPriorities: admissionPriorities.length,
    },
  };
}

function buildAdmissionPriorities(
  rows: readonly GrainDataCoverageRow[],
  gaps: readonly GrainDataCoverageGap[],
): GrainDataAdmissionPriority[] {
  const candidates: Omit<GrainDataAdmissionPriority, "rank">[] = [
    ...rows
      .filter((row) => row.currentStep === "explanation_only")
      .map((row) => ({
        id: `promote-${row.id}`,
        label: row.label,
        kind: "promote_watch_lane" as const,
        currentStep: "explanation_only" as const,
        domain: row.domain,
        scope: row.scope,
        sourceIds: row.sourceIds,
        whyItMatters: `${row.bullSignal} ${row.bearSignal}`,
        admissionRequirement:
          "Add thesis-packet admission, mapper logic, freshness handling, and regression tests before this can affect the rating.",
        scoreBoundary:
          "Currently explanation-only. It may guide review priority, but it cannot move the deterministic score.",
      })),
    ...gaps.map((gap) => ({
      id: `admit-${gap.id}`,
      label: gap.label,
      kind: "admit_missing_source" as const,
      currentStep: "missing" as const,
      domain: null,
      scope: null,
      sourceIds: [],
      whyItMatters: "This impact area is named in the grain profile but has no admitted source lane yet.",
      admissionRequirement:
        "Define source identity, collector command, target table or RPC, units, cadence, freshness proof, mapper logic, and tests.",
      scoreBoundary:
        "Currently missing. Do not cite it as a fact or score input until source admission is complete.",
    })),
  ];

  return candidates.slice(0, 5).map((candidate, index) => ({
    ...candidate,
    rank: index + 1,
  }));
}

function dataCoverageRowForFactor(factor: GrainImpactFactor): GrainDataCoverageRow {
  const currentStep = coverageStepForSourceClass(factor.sourceClass);

  return {
    id: factor.id,
    label: factor.label,
    domain: factor.domain,
    scope: factor.scope,
    sourceClass: factor.sourceClass,
    sourceIds: [...factor.sourceIds],
    currentStep,
    checklist: CHECKLISTS[currentStep],
    bullSignal: factor.bullSignal,
    bearSignal: factor.bearSignal,
    boundary: factor.boundary,
    nextAction: nextActionForSourceClass(factor.sourceClass),
  };
}

function coverageStepForSourceClass(sourceClass: ImpactSourceClass): GrainDataCoverageStep {
  if (sourceClass === "official_thesis_input" || sourceClass === "price_context") {
    return "scored";
  }

  if (sourceClass === "watch_only") {
    return "explanation_only";
  }

  return "missing";
}

function nextActionForSourceClass(sourceClass: ImpactSourceClass): string {
  if (sourceClass === "official_thesis_input") {
    return "Keep freshness proof current; stale or missing rows lower confidence before widening the model.";
  }

  if (sourceClass === "price_context") {
    return "Use as confirmation or challenge only; never replace source-backed supply, demand, or movement facts.";
  }

  if (sourceClass === "watch_only") {
    return "Use for explanation and inspection priority until packet admission and mapper tests are added.";
  }

  return "Source contract, collector, and scoring mapper are still missing.";
}
