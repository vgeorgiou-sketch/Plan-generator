/*
  Convergence, not addition.

  The unit of value isn't a weighted sum — it's how many independent layers
  corroborate the same building, and whether a kinetic layer confirms a
  pressure layer. There is no stored score; everything here is computed from
  the signals present, so it's always explainable.
*/

import {
  LAYER_CATEGORY,
  LAYER_LABEL,
  SIGNAL_LAYERS,
  type ConvergenceResult,
  type FactType,
  type GridCell,
  type Opportunity,
  type Signal,
  type SignalLayer,
} from './types.ts'

const FACT_STRENGTH: Record<FactType, number> = { filed: 3, derived: 2, inferred: 1 }

/** Distinct layers present in a category. */
function distinctLayers(signals: Signal[], category: 'pressure' | 'kinetic' | 'context'): SignalLayer[] {
  const set = new Set<SignalLayer>()
  for (const s of signals) if (LAYER_CATEGORY[s.layer] === category) set.add(s.layer)
  return [...set]
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(fromIso + 'T00:00:00Z')
  const to = Date.parse(toIso + 'T00:00:00Z')
  return Math.round((to - from) / 86_400_000)
}

/**
 * Compute the convergence picture for one building.
 * @param asOf ISO date to measure lead time against (defaults to today, UTC).
 */
export function computeConvergence(signals: Signal[], asOf?: string): ConvergenceResult {
  const pressure = distinctLayers(signals, 'pressure')
  const kinetic = distinctLayers(signals, 'kinetic')

  // The weak link: lowest confidence among signals that actually count toward
  // convergence (pressure + kinetic). Context signals inform but don't count,
  // so they can't drag the weak-link reading. Surfaced, never averaged away.
  const contributors = signals.filter(
    (s) => LAYER_CATEGORY[s.layer] === 'pressure' || LAYER_CATEGORY[s.layer] === 'kinetic',
  )
  const minConfidence = contributors.length ? Math.min(...contributors.map((s) => s.confidence)) : 1

  // Lead time: earliest kinetic event vs the asOf date. Only kinetic signals
  // represent a change happening; pressure/context are standing conditions.
  const asOfDate = asOf ?? new Date().toISOString().slice(0, 10)
  const kineticDates = signals
    .filter((s) => LAYER_CATEGORY[s.layer] === 'kinetic')
    .map((s) => s.observedAt)
    .sort()
  const leadTimeDays = kineticDates.length ? daysBetween(kineticDates[0], asOfDate) : undefined

  return {
    pressureLayers: pressure.length,
    kineticLayers: kinetic.length,
    isConverged: pressure.length >= 1 && kinetic.length >= 1,
    minConfidence,
    leadTimeDays,
  }
}

/** All signals for a layer, oldest first — the sequence, not a summary.
 *  A layer can hold several distinct dated events (e.g. two PSC changes);
 *  they must never be flattened into one, because the sequence is the insight. */
export function orderedSignals(opportunity: Opportunity, layer: SignalLayer): Signal[] {
  return opportunity.signals
    .filter((s) => s.layer === layer)
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt))
}

/** The strongest signal for a layer (filed beats derived beats inferred). */
function bestSignalForLayer(signals: Signal[], layer: SignalLayer): Signal | undefined {
  return signals
    .filter((s) => s.layer === layer)
    .sort((a, b) => FACT_STRENGTH[b.factType] - FACT_STRENGTH[a.factType])[0]
}

function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return d && m && y ? `${d}/${m}/${y}` : iso
}

/**
 * One row of grid cells for a building, in canonical layer order.
 * Empty layers stay visibly empty — a sparse grid on real data is correct.
 *
 * A cell summarises a layer's provenance for the matrix view, but it never
 * *merges* distinct events: when a layer holds more than one signal the
 * tooltip says so and the count is exposed, so the UI can expand the cell
 * into the full dated sequence (see `orderedSignals`) rather than collapsing
 * two PSC events into a single "ownership signal".
 */
export function deriveGridCells(opportunity: Opportunity): GridCell[] {
  return SIGNAL_LAYERS.map((layer) => {
    const all = orderedSignals(opportunity, layer)
    if (all.length === 0) {
      return { buildingId: opportunity.id, layer, state: 'empty', tooltip: `${LAYER_LABEL[layer]}: no record` }
    }
    const strongest = bestSignalForLayer(opportunity.signals, layer)!
    const multi = all.length > 1
    const tooltip = multi
      ? `${LAYER_LABEL[layer]}: ${all.length} events — ${all.map((s) => shortDate(s.observedAt)).join(' → ')}`
      : `${strongest.label} · ${shortDate(strongest.observedAt)}`
    return {
      buildingId: opportunity.id,
      layer,
      state: strongest.factType,
      signalId: strongest.id,
      tooltip,
      ...(multi ? { count: all.length } : {}),
    }
  })
}

/** Convenience: convergence straight from an Opportunity. */
export function convergenceOf(opportunity: Opportunity, asOf?: string): ConvergenceResult {
  return computeConvergence(opportunity.signals, asOf)
}
