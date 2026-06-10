import {
  CANADA_RATING_DOMAIN_WEIGHTS,
  normalizeDomainWeights,
  type DomainWeights,
  type NormalizedDomainWeights,
  type RatingDomainId,
  type RatingLane,
  US_RATING_DOMAIN_WEIGHTS,
} from "@/lib/thesis/rating-model";
import { getGrainImpactProfile, type ImpactSourceClass } from "@/lib/thesis/grain-impact-map";

const SCORING_SOURCE_CLASS_BOOSTS: Record<ImpactSourceClass, number> = {
  official_thesis_input: 0.12,
  price_context: 0.1,
  // Bounded-context lanes are admitted and deterministic but weight-neutral:
  // they may tilt a score inside an active primary domain, never widen the
  // domain's weight share.
  bounded_context: 0,
  watch_only: 0,
  parked: 0,
};

const MAX_DOMAIN_BOOST = 0.3;

export interface GrainImpactDomainWeightOptions {
  structurallyAbsentDomains?: readonly RatingDomainId[];
}

function baseDomainWeightsForLane(lane: RatingLane): DomainWeights {
  if (lane === "canada") return CANADA_RATING_DOMAIN_WEIGHTS;
  if (lane === "us") return US_RATING_DOMAIN_WEIGHTS;

  const crossBorderWeights = Object.fromEntries(
    Object.keys(CANADA_RATING_DOMAIN_WEIGHTS).map((domain) => [
      domain,
      (CANADA_RATING_DOMAIN_WEIGHTS[domain as RatingDomainId] + US_RATING_DOMAIN_WEIGHTS[domain as RatingDomainId]) / 2,
    ]),
  ) as Record<RatingDomainId, number>;

  return Object.freeze(crossBorderWeights);
}

function impactDomainBoosts(grain: string): Partial<Record<RatingDomainId, number>> {
  const profile = getGrainImpactProfile(grain);
  const boosts: Partial<Record<RatingDomainId, number>> = {};

  if (!profile) return boosts;

  for (const factor of profile.impactFactors) {
    const boost = SCORING_SOURCE_CLASS_BOOSTS[factor.sourceClass];
    if (boost <= 0) continue;

    boosts[factor.domain] = Math.min(MAX_DOMAIN_BOOST, (boosts[factor.domain] ?? 0) + boost);
  }

  return boosts;
}

export function getImpactAdjustedDomainWeights(
  grain: string,
  lane: RatingLane,
  options: GrainImpactDomainWeightOptions = {},
): NormalizedDomainWeights {
  const baseWeights = baseDomainWeightsForLane(lane);
  const boosts = impactDomainBoosts(grain);
  const adjustedWeights = Object.fromEntries(
    Object.entries(baseWeights).map(([domain, weight]) => {
      const domainId = domain as RatingDomainId;
      return [domainId, weight * (1 + (boosts[domainId] ?? 0))];
    }),
  ) as Record<RatingDomainId, number>;

  return normalizeDomainWeights(Object.freeze(adjustedWeights), options.structurallyAbsentDomains);
}
