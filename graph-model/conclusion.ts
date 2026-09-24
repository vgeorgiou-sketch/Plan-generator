/*
  Traffic-light conclusion — the brain speaking.

  Replaces a binary "converged / not" with a graded verdict. Scoring
  principle (tune the thresholds, not the logic):
    - Independent source-TYPES connected matters more than raw count. Five
      filings from one event ≠ five dots — we count distinct SignalLayers,
      per the existing convergence rule, restricted to layers that actually
      represent activity (kinetic + pressure; 'context' layers like the
      planning applicant or a press report corroborate but don't move the
      needle — same exclusion convergence.ts already applies).
    - Recency matters: a cluster whose kinetic signals are still fresh as of
      the analysis date outranks one that's gone quiet.
    - Confidence must reflect the weakest link — never averaged away.

  On `asOf` vs. a press/disclosure date: these are DIFFERENT dates and must
  not be conflated. `asOf` answers "how fresh is this intelligence right
  now, to someone using the tool" — for a live sweep that's really today.
  `pressDate` (optional, separate) answers "how many days ahead of public
  disclosure did we know" — the lead-time metric. Scoring recency against a
  press date would retroactively call fresh, pre-disclosure signals "stale"
  once disclosure happens, which defeats the tool's entire purpose. See
  ./seed.ts for why the worked example sets `asOf` to shortly after its own
  kinetic activity, not to the (much later) press date.
*/

import { LAYER_CATEGORY, LAYER_LABEL } from '../signal-model/types.ts'
import type { Signal, SignalLayer } from '../signal-model/types.ts'
import { clusterSignals } from './cluster.ts'
import type { Cluster, Conclusion, EdgeType, PublicContact, SignalStrength } from './types.ts'

const RECENCY_WINDOW_DAYS = 183 // ~6 months

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(fromIso + 'T00:00:00Z')
  const to = Date.parse(toIso + 'T00:00:00Z')
  return Math.round((to - from) / 86_400_000)
}

/** Signals that represent actual activity — the ones scoring counts. Same
 *  exclusion as convergence.ts: context layers corroborate, don't score. */
function scorable(signals: Signal[]): Signal[] {
  return signals.filter((s) => LAYER_CATEGORY[s.layer] !== 'context')
}

export interface ClusterScore {
  distinctLayers: number
  layers: SignalLayer[]
  recentSignalCount: number
  totalSignalCount: number
  minConfidence: number
}

export function scoreCluster(cluster: Cluster, asOf: string): ClusterScore {
  const all = clusterSignals(cluster)
  const scored = scorable(all)
  const layerSet = new Set(scored.map((s) => s.layer))
  const recent = scored.filter((s) => Math.abs(daysBetween(s.observedAt, asOf)) <= RECENCY_WINDOW_DAYS)
  const minConfidence = scored.length ? Math.min(...scored.map((s) => s.confidence)) : 1

  return {
    distinctLayers: layerSet.size,
    layers: [...layerSet],
    recentSignalCount: recent.length,
    totalSignalCount: all.length,
    minConfidence,
  }
}

function baseStrength(distinctLayers: number): SignalStrength {
  if (distinctLayers >= 4) return 'green' // e.g. SPV + charge + PSC + a pressure/prior-owner signal
  if (distinctLayers >= 2) return 'amber' // e.g. SPV + charge, or SPV + PSC change
  return 'red' // a single dot — on the radar, not yet a pattern
}

function downgrade(s: SignalStrength): SignalStrength {
  return s === 'green' ? 'amber' : 'red'
}

/** Turn a score into a traffic light. Confidence and recency can only pull
 *  the verdict DOWN from the layer-count baseline, never push it up. */
export function strengthFromScore(score: ClusterScore): SignalStrength {
  let strength = baseStrength(score.distinctLayers)
  if (score.totalSignalCount > 0 && score.recentSignalCount === 0) strength = downgrade(strength)
  if (score.minConfidence < 0.6 && strength === 'green') strength = 'amber'
  return strength
}

const ROLE_BY_EDGE: Record<EdgeType, (toLabel: string) => string> = {
  owns: (to) => `Owning entity of ${to}`,
  controls: (to) => `Controller of ${to}`,
  directorOf: (to) => `Director of ${to}`,
  chargeHolder: (to) => `Charge holder (lender) on ${to}`,
  sharesAddress: (to) => `Shares a registered office with ${to}`,
  priorOwner: (to) => `Prior owner of ${to}`,
  operates: (to) => `Developer / operator of ${to}`,
}

/** Public names only (companies, people, lenders, developers) — never the
 *  building itself — so a human can eyeball "do we know them?" */
export function extractPublicContacts(cluster: Cluster): PublicContact[] {
  const byId = new Map(cluster.nodes.map((n) => [n.id, n]))
  const seen = new Set<string>()
  const contacts: PublicContact[] = []

  for (const e of cluster.edges) {
    const fromNode = byId.get(e.from)
    const toNode = byId.get(e.to)
    if (!fromNode || fromNode.type === 'building') continue // the contact is always the non-building end
    const key = `${fromNode.id}::${e.type}::${e.to}`
    if (seen.has(key)) continue
    seen.add(key)
    contacts.push({
      name: fromNode.label,
      role: ROLE_BY_EDGE[e.type](toNode?.label ?? e.to),
      sourceUrl: e.sourceUrl,
    })
  }
  return contacts
}

function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return d && m && y ? `${d}/${m}/${y}` : iso
}

/** Plain-English prose naming which dots connected, in date order. Generic —
 *  works for any cluster, not hand-written for the seed case. */
export function buildReasoning(cluster: Cluster, score: ClusterScore): string {
  const scored = scorable(clusterSignals(cluster))
  if (scored.length === 0) return `No independent public records connect to ${cluster.buildingLabel} yet.`

  const clauses = scored.map((s) => `${LAYER_LABEL[s.layer]} — ${s.label} (${shortDate(s.observedAt)})`)
  const plural = score.distinctLayers === 1 ? 'record' : 'independent record types'
  return (
    `${score.distinctLayers} ${plural} connect to ${cluster.buildingLabel}: ` +
    clauses.join('; ') +
    '.'
  )
}

function headlineFor(cluster: Cluster, strength: SignalStrength): string {
  const verb: Record<SignalStrength, string> = {
    green: 'is being actively repositioned',
    amber: 'shows a forming ownership/control cluster',
    red: 'has an early signal worth watching',
  }
  const n = cluster.edges.length
  return `The system believes ${cluster.buildingLabel} ${verb[strength]} — ${n} cited public record${n === 1 ? '' : 's'} connect.`
}

function adviceFor(strength: SignalStrength): string {
  if (strength === 'green') {
    return 'Approach before RFP — the owner will need a design team. Public contacts listed below.'
  }
  if (strength === 'amber') {
    return 'Not yet actionable on its own — keep watching. One more independent filing (a charge, a use-class signal, a planning application) would confirm it.'
  }
  return 'Too early to approach. A single dot, not yet a pattern — keep on the radar and revisit if another filing lands.'
}

/** Lead time: earliest scorable (kinetic/pressure) signal in the cluster vs.
 *  a separate, optional disclosure date (press, marketing, etc.) — NOT asOf. */
function leadTimeVsDisclosure(cluster: Cluster, pressDate?: string): number | undefined {
  if (!pressDate) return undefined
  const dates = scorable(clusterSignals(cluster))
    .map((s) => s.observedAt)
    .sort()
  return dates.length ? daysBetween(dates[0], pressDate) : undefined
}

export interface ConclusionOptions {
  /** Reference date for judging how fresh the cluster's activity is. For a
   *  live sweep, pass today. See the file header for why this must not be
   *  the press/disclosure date. */
  asOf: string
  /** Optional: a public disclosure date (press, marketing launch), if one has
   *  happened, purely to compute the lead-time metric. */
  pressDate?: string
}

export function buildConclusion(cluster: Cluster, opts: ConclusionOptions): Conclusion {
  const score = scoreCluster(cluster, opts.asOf)
  const strength = strengthFromScore(score)

  return {
    strength,
    headline: headlineFor(cluster, strength),
    reasoning: buildReasoning(cluster, score),
    evidence: cluster.edges,
    publicContacts: extractPublicContacts(cluster),
    leadTimeDays: leadTimeVsDisclosure(cluster, opts.pressDate),
    advice: adviceFor(strength),
  }
}
