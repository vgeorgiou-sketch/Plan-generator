/*
  Task 5 — cross-reference the pressure universe against kinetic hits and
  compute convergence per building. Pure, no network.

  A universe record (EPC/VOA) carries a pressure signal and the building
  identity. A kinetic hit (SPV / charge / demolition) carries one kinetic
  signal and the address it was found at. We match hits to buildings by
  address; an exact postcode+number match is `filed`, anything fuzzier stays
  `inferred` per the data model.
*/

import { convergenceOf } from '../signal-model/convergence.ts'
import type { ConvergenceResult, Opportunity, Signal } from '../signal-model/types.ts'
import { bestMatch } from './addressMatch.ts'

export interface UniverseRecord {
  id: string
  address: string
  postcode: string
  borough: string
  floorArea?: number
  pressureSignal: Signal // e.g. the EPC signal
}

export interface KineticHit {
  address: string
  signal: Signal // layer is one of the kinetic layers
}

export interface AssembledBuilding {
  opportunity: Opportunity
  convergence: ConvergenceResult
  /** Match confidence for each attached kinetic hit — surfaced, not hidden. */
  matchScores: { signalId: string; score: number; exact: boolean }[]
}

/**
 * Attach each kinetic hit to its best-matching universe building, then build
 * an Opportunity + convergence per building. Hits that match nothing in the
 * universe are dropped from the headline (kinetic-only, untargeted) but
 * returned separately so nothing is silently lost.
 */
export function assemble(
  universe: UniverseRecord[],
  kineticHits: KineticHit[],
  asOf?: string,
): { buildings: AssembledBuilding[]; unmatchedHits: KineticHit[] } {
  const byId = new Map<string, { rec: UniverseRecord; signals: Signal[]; scores: AssembledBuilding['matchScores'] }>()
  for (const rec of universe) byId.set(rec.id, { rec, signals: [rec.pressureSignal], scores: [] })

  const unmatchedHits: KineticHit[] = []
  for (const hit of kineticHits) {
    const match = bestMatch(hit.address, universe, (u) => `${u.address} ${u.postcode}`)
    if (!match) {
      unmatchedHits.push(hit)
      continue
    }
    const bucket = byId.get(match.item.id)!
    // Fuzzy match downgrades a filed hit to inferred, and caps its confidence.
    const attached: Signal = match.result.exact
      ? hit.signal
      : {
          ...hit.signal,
          factType: hit.signal.factType === 'inferred' ? 'inferred' : 'inferred',
          confidence: Math.min(hit.signal.confidence, 0.5),
          note: [hit.signal.note, `address match ${match.result.score.toFixed(2)} (not exact) — confirm`]
            .filter(Boolean)
            .join('; '),
        }
    bucket.signals.push(attached)
    bucket.scores.push({ signalId: attached.id, score: match.result.score, exact: match.result.exact })
  }

  const buildings: AssembledBuilding[] = []
  for (const { rec, signals, scores } of byId.values()) {
    const opportunity: Opportunity = {
      id: rec.id,
      address: rec.address,
      postcode: rec.postcode,
      borough: rec.borough,
      floorArea: rec.floorArea,
      signals,
      status: 'new',
    }
    buildings.push({ opportunity, convergence: convergenceOf(opportunity, asOf), matchScores: scores })
  }

  return { buildings, unmatchedHits }
}

/** The deliverable: only buildings where a kinetic layer confirmed a pressure layer. */
export function convergedOnly(buildings: AssembledBuilding[]): AssembledBuilding[] {
  return buildings
    .filter((b) => b.convergence.isConverged)
    .sort((a, b) => b.convergence.kineticLayers - a.convergence.kineticLayers)
}
