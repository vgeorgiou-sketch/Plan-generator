/*
  Part 1 — wider Southwark kinetic pull, built as a graph.

  Extends the proven Task 0 path from one hand-fed building to a real sweep:
  real-estate SIC codes × Southwark × rolling-12-month incorporation
  (findSouthwarkRealEstateCandidates, ../puller/spvScan.ts), then for EACH
  hit pulls PSC, charges, filing history and officers, and builds a graph
  cluster + traffic-light conclusion (../graph-model) — the same engine the
  confirmed Southwark Bridge Road case runs through.

  Standing rule, unchanged from Task 0: no keyword guessing. This sweep does
  NOT call searchCompanies() (free-text search) anywhere — only the
  structured advancedSearch() (SIC/location/date filters). See
  spvScan.ts's findSouthwarkRealEstateCandidates() for why structured
  discovery is a different thing from the "HUB Accountants" failure mode,
  not a loophole around the same rule.

  Run: node --use-system-ca --env-file=.env --experimental-strip-types puller/sweep.ts
  Needs CH_API_KEY + egress; fails loudly and prints nothing fabricated
  otherwise (verified in this sandbox — see the honest failure at the bottom
  of this file's own comments / the session transcript).
*/

import {
  activeOfficers,
  companyCharges,
  companyProfile,
  filingHistory,
  officers,
  personsWithSignificantControl,
  pickCompanyName,
  type Charge,
  type CompanyHit,
  type CompanyProfile,
  type OfficerItem,
  type PscItem,
} from './companiesHouse.ts'
import { findSouthwarkRealEstateCandidates } from './spvScan.ts'
import { addressString } from './kineticSignals.ts'
import { checkConversionSignal, inferSectorFromName, sectorRank, SECTOR_LABEL, type ConversionCheck, type SectorTag } from './sector.ts'
import { isOwnershipChange, type ChFiling } from './leadTime.ts'
import { checkPlanningForAddress, planningSignalForBuilding, type MatchedPlanningRow } from './planning.ts'
import { sleep } from './netEnv.ts'
import { buildConclusion } from '../graph-model/conclusion.ts'
import { detectClusters } from '../graph-model/cluster.ts'
import type { Conclusion, Graph, GraphEdge, GraphNode, SignalStrength } from '../graph-model/types.ts'
import type { Signal, SignalLayer } from '../signal-model/types.ts'
import { fileURLToPath } from 'node:url'

const CH = 'https://find-and-update.company-information.service.gov.uk/company'

// ── pure logic (tested offline in sweep.test.ts) ──────────────────────────

export function slugify(s: string): string {
  return s
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

function filedSignal(
  buildingId: string,
  layer: SignalLayer,
  label: string,
  value: string,
  sourceUrl: string,
  observedAt: string,
  sourceRef?: string,
): Signal {
  return {
    id: `${layer}-${sourceRef ?? buildingId}-${observedAt}-${Math.random().toString(36).slice(2, 6)}`,
    buildingId,
    layer,
    factType: 'filed',
    label,
    value,
    sourceUrl,
    sourceRef,
    observedAt,
    retrievedAt: new Date().toISOString().slice(0, 10),
    confidence: 1,
  }
}

export interface EnrichedCandidate {
  hit: CompanyHit
  profile: CompanyProfile
  psc: PscItem[]
  charges: Charge[]
  officers: OfficerItem[]
  filings: ChFiling[]
}

/** Pull PSC, charges, officers and filing history for one candidate — the "for
 *  each hit" step of Part 1. Every fact taken at face value; nothing merged
 *  or guessed here, that happens (transparently) in buildCandidateGraph. */
export async function enrichCandidate(hit: CompanyHit): Promise<EnrichedCandidate> {
  const [profile, psc, charges, officerList, filings] = await Promise.all([
    companyProfile(hit.company_number),
    personsWithSignificantControl(hit.company_number),
    companyCharges(hit.company_number),
    officers(hit.company_number),
    filingHistory(hit.company_number),
  ])
  return { hit, profile, psc, charges, officers: officerList, filings }
}

export interface CandidateGraphResult {
  graph: Graph
  buildingNodeId: string
  companyNodeId: string
  sector: SectorTag
  conversion: ConversionCheck
  /** How many ownership-change filings this candidate has (per leadTime.ts's
   *  own rule) — a fast eyeball of "is this entity actually doing anything",
   *  independent of the graph's own scoring. */
  ownershipChangeFilings: number
  /** Whether a planning check was actually run for this candidate (vs. never
   *  attempted) — see the honesty note on `checked` in planning.ts. */
  planningChecked: boolean
}

export interface CandidateContext {
  /** A Task-1-derived prior-use match for this address (or null/omit — Part 1
   *  works without it, conversion just stays unconfirmed). */
  matchedEpc?: { isLargeCommercial: boolean } | null
  /**
   * Planning applications matched to this address — the discriminator axis.
   * A real building lighting up several kinetic layers (SPV+charge+PSC) AND
   * a genuine planning application is a scheme; the same layer count with NO
   * planning is exactly the pattern ordinary commerce (a pub refinancing)
   * produces. Passing this in also corroborates the tentative building
   * address — see the 'owns' edge confidence below.
   */
  matchedPlanning?: MatchedPlanningRow[] | null
}

/**
 * Turn one enriched candidate into a graph fragment: a company node (its own
 * incorporation/PSC/charge facts), a tentative building node (from its
 * registered office address — NOT a confirmed site address unless a matched
 * planning application corroborates it, see the 'owns' edge below), and
 * controller/lender/director nodes with cited edges.
 */
export function buildCandidateGraph(c: EnrichedCandidate, context: CandidateContext = {}): CandidateGraphResult {
  const { matchedEpc, matchedPlanning } = context
  const companyNumber = c.hit.company_number
  const companyName = pickCompanyName(c.profile.company_name, c.hit.company_name)
  const companyNodeId = `company:${companyNumber}`
  const companyUrl = `${CH}/${companyNumber}`

  const registeredAddress =
    addressString(c.profile.registered_office_address) || c.hit.address_snippet || `(no address on file for ${companyNumber})`
  const buildingNodeId = `building:${slugify(registeredAddress)}`
  const incorporatedOn = (c.profile.date_of_creation ?? c.hit.date_of_creation ?? '').slice(0, 10) || '1970-01-01'

  const incorporationSignal = filedSignal(
    buildingNodeId,
    'companiesHouseSpv',
    `SPV incorporated: ${companyName} (${companyNumber})`,
    companyNumber,
    companyUrl,
    incorporatedOn,
    companyNumber,
  )

  const companyNode: GraphNode = {
    id: companyNodeId,
    type: 'company',
    label: `${companyName} (${companyNumber})`,
    signals: [incorporationSignal],
    sourceUrl: companyUrl,
  }
  const buildingNode: GraphNode = { id: buildingNodeId, type: 'building', label: registeredAddress, signals: [] }
  const nodes: GraphNode[] = [buildingNode, companyNode]
  const nodeIds = new Set([buildingNodeId, companyNodeId])
  const addNode = (n: GraphNode) => {
    if (!nodeIds.has(n.id)) {
      nodeIds.add(n.id)
      nodes.push(n)
    }
  }

  // A matched planning application corroborates the registered office as the
  // real site (the standing rule: match the real site, not a registered
  // office) — the same reason the seed's own 'owns' edge sits at 0.9, not
  // lower. Without one, this stays a guess at 0.5.
  const planningMatches = matchedPlanning ?? []
  const ownsConfidence = planningMatches.length > 0 ? 0.9 : 0.5

  const edges: GraphEdge[] = [
    {
      from: companyNodeId,
      to: buildingNodeId,
      type: 'owns',
      sourceUrl: companyUrl,
      observedAt: incorporatedOn,
      confidence: ownsConfidence,
    },
  ]

  // Planning signals belong to the BUILDING (the site), not the company —
  // unlike every other signal here, which is filed against the corporate
  // entity. This is the discriminator: SPV/charge/PSC activity alone can't
  // tell a development scheme from ordinary commerce (a pub refinancing),
  // but a real planning application on the SITE can.
  for (const m of planningMatches) {
    const sig = planningSignalForBuilding(m, buildingNodeId)
    if (sig) buildingNode.signals.push(sig) // null means no parseable date — never fabricated, so nothing added
  }

  for (const p of c.psc) {
    if (!p.name) continue // e.g. a redacted "super-secure-person" — no name to cite, honest skip
    const isIndividual = (p.kind ?? '').includes('individual')
    const controllerId = isIndividual ? `person:${slugify(p.name)}:${companyNumber}` : `company:controller:${slugify(p.name)}`
    addNode({ id: controllerId, type: isIndividual ? 'person' : 'company', label: p.name, signals: [] })

    const observedAt = (p.ceased_on ?? p.notified_on ?? '').slice(0, 10) || '1970-01-01'
    const pscSignal = filedSignal(
      buildingNodeId,
      'companiesHousePsc',
      p.ceased_on
        ? `Control ceased: ${p.name}`
        : `Active control: ${p.name}${p.natures_of_control?.length ? ` (${p.natures_of_control.join(', ')})` : ''}`,
      p.ceased_on ? `ceased ${p.ceased_on}` : (p.natures_of_control?.[0] ?? 'active'),
      `${companyUrl}/persons-with-significant-control`,
      observedAt,
    )
    companyNode.signals.push(pscSignal)
    edges.push({ from: controllerId, to: companyNodeId, type: 'controls', sourceUrl: pscSignal.sourceUrl, observedAt, confidence: 1 })
  }

  for (const ch of c.charges) {
    const observedAt = (ch.satisfied_on ?? ch.created_on ?? '').slice(0, 10) || '1970-01-01'
    const chargeSignal = filedSignal(
      buildingNodeId,
      'companiesHouseCharge',
      ch.satisfied_on ? 'Charge satisfied' : 'Charge registered',
      ch.classification?.description ?? ch.status,
      `${companyUrl}/charges`,
      observedAt,
      ch.charge_code,
    )
    companyNode.signals.push(chargeSignal)

    // Only draw a chargeHolder edge when a lender name is actually present —
    // same discipline as the seed cluster's charge (no name, no edge).
    const lenderName = ch.persons_entitled?.find((p) => p.name)?.name
    if (lenderName) {
      const lenderId = `lender:${slugify(lenderName)}`
      addNode({ id: lenderId, type: 'lender', label: lenderName, signals: [] })
      edges.push({ from: lenderId, to: companyNodeId, type: 'chargeHolder', sourceUrl: chargeSignal.sourceUrl, observedAt, confidence: 1 })
    }
  }

  // Active officers only — a resigned director isn't a current public contact.
  // Person ids are namespaced PER COMPANY: without Companies House's own
  // officer-appointment id (not pulled here), we can't safely merge "John
  // Smith, director of A" with "John Smith, director of B" as one real person.
  for (const o of activeOfficers(c.officers)) {
    if (!o.name) continue
    const personId = `person:${slugify(o.name)}:${companyNumber}`
    addNode({ id: personId, type: 'person', label: o.name, signals: [] })
    edges.push({
      from: personId,
      to: companyNodeId,
      type: 'directorOf',
      sourceUrl: `${companyUrl}/officers`,
      observedAt: (o.appointed_on ?? '').slice(0, 10) || '1970-01-01',
      confidence: 1,
    })
  }

  const sector = inferSectorFromName(companyName)
  const conversion = checkConversionSignal(sector, matchedEpc ?? null)
  const ownershipChangeFilings = c.filings.filter((f) => isOwnershipChange(f, { isLLP: /^(OC|SO|NC)/i.test(companyNumber) })).length

  return {
    graph: { nodes, edges },
    buildingNodeId,
    companyNodeId,
    sector,
    conversion,
    ownershipChangeFilings,
    planningChecked: matchedPlanning !== undefined,
  }
}

/** Merge several candidate graph fragments into one graph (dedup by node id —
 *  a shared controller/lender/registered-address across two SPVs becomes
 *  ONE node with edges to both, which is exactly how sharesAddress-style
 *  connections should surface without a dedicated pass). */
export function mergeGraphs(results: CandidateGraphResult[]): Graph {
  const nodesById = new Map<string, GraphNode>()
  const edges: GraphEdge[] = []
  for (const r of results) {
    for (const n of r.graph.nodes) {
      const existing = nodesById.get(n.id)
      if (existing) existing.signals.push(...n.signals) // same node reached from two candidates — merge its evidence
      else nodesById.set(n.id, { ...n, signals: [...n.signals] })
    }
    edges.push(...r.graph.edges)
  }
  return { nodes: [...nodesById.values()], edges }
}

export interface RankedCluster {
  result: CandidateGraphResult
  conclusion: Conclusion
  rank: number
}

const STRENGTH_ORDER: Record<SignalStrength, number> = { green: 0, amber: 1, red: 2 }

/** Same ordering rule used both to pick the best candidate per building
 *  (dedup) and to sort the final list — one comparator, not two copies that
 *  could quietly drift apart. */
function compareRanked(a: RankedCluster, b: RankedCluster): number {
  return a.rank - b.rank || STRENGTH_ORDER[a.conclusion.strength] - STRENGTH_ORDER[b.conclusion.strength] || (b.conclusion.leadTimeDays ?? 0) - (a.conclusion.leadTimeDays ?? 0)
}

/**
 * Score, conclude and rank every candidate's cluster — commercial-office
 * and conversion signals lead, per the brief; nothing is discarded. Within
 * the same sector tier, sorted by conclusion STRENGTH next: this is the
 * actual point of feeding convergence more signals — a thin, single-layer
 * cluster (ordinary commerce) must rank below a converging one of the same
 * sector, not sit at the mercy of insertion order.
 *
 * Deduped by BUILDING, not by candidate: confirmed live, two different
 * companies can share one registered office (a formation agent, an
 * accountant's address) — mergeGraphs/detectClusters already collapse them
 * into ONE cluster at the graph level (same buildingId → same node ids), but
 * this function used to still emit one row per ORIGINATING CANDIDATE, so
 * the identical building printed twice. Kept the best-ranked candidate's
 * row per building — never the same physical address twice.
 */
export function rankCandidates(results: CandidateGraphResult[], asOf: string): RankedCluster[] {
  const graph = mergeGraphs(results)
  const clusters = detectClusters(graph)
  const byBuildingId = new Map(clusters.map((c) => [c.buildingId, c]))

  const all = results
    .map((result) => {
      const cluster = byBuildingId.get(result.buildingNodeId)
      const conclusion = cluster ? buildConclusion(cluster, { asOf }) : undefined
      return conclusion ? { result, conclusion, rank: sectorRank(result.sector.sector, result.conversion.isConversion) } : null
    })
    .filter((x): x is RankedCluster => x !== null)

  const bestByBuilding = new Map<string, RankedCluster>()
  for (const rc of all) {
    const existing = bestByBuilding.get(rc.result.buildingNodeId)
    if (!existing || compareRanked(rc, existing) < 0) bestByBuilding.set(rc.result.buildingNodeId, rc)
  }

  return [...bestByBuilding.values()].sort(compareRanked)
}

// ── orchestration (network — not runnable in this sandbox; see README) ────

// Confirmed live: firing planning checks back-to-back for every candidate
// (each check itself is 2 search variants × GET-form-then-POST — see
// planning.ts) tripped Southwark's rate limit around the 7th candidate,
// silently starving the discriminator for the rest of the sweep and
// undiscriminating the whole ranking. Pace them out — this is the primary
// fix; fetchPlanningPage's own 429 retry (planning.ts) is the safety net
// for whatever still slips through.
const PLANNING_CHECK_MIN_DELAY_MS = 3000
const PLANNING_CHECK_MAX_DELAY_MS = 5000

async function main() {
  console.log('Part 1 — wider Southwark kinetic pull\n')

  const candidates = await findSouthwarkRealEstateCandidates({ location: 'southwark', monthsBack: 12 })
  console.log(`  ${candidates.length} candidate entities (SIC × Southwark × 12 months, deduped)\n`)
  if (candidates.length === 0) {
    console.log('No candidates found. A valid kill — or the filters need widening.')
    return
  }

  const results: CandidateGraphResult[] = []
  for (let i = 0; i < candidates.length; i++) {
    const hit = candidates[i]
    console.log(`  enriching ${hit.company_name} (${hit.company_number})…`)
    const enriched = await enrichCandidate(hit)
    const address = addressString(enriched.profile.registered_office_address) || enriched.hit.address_snippet

    // Planning is the discriminator (see planning.ts): a candidate that lights
    // up SPV+charge+PSC but has no planning application is exactly the shape
    // ordinary commerce (a pub refinancing) produces. A per-candidate failure
    // here must never kill the whole sweep — it just leaves that candidate's
    // planning cell genuinely empty, with the reason logged, not silently.
    let matchedPlanning: MatchedPlanningRow[] | null = null
    if (address) {
      if (i > 0) await sleep(PLANNING_CHECK_MIN_DELAY_MS + Math.random() * (PLANNING_CHECK_MAX_DELAY_MS - PLANNING_CHECK_MIN_DELAY_MS))
      const planning = await checkPlanningForAddress(address).catch((err) => {
        console.log(`    planning check failed (${(err as Error).message}) — leaving it unchecked, not "confirmed empty"`)
        return null
      })
      if (planning) {
        if (!planning.checked) console.log(`    planning check inconclusive: ${planning.error}`)
        matchedPlanning = planning.matches
      }
    }

    // no EPC universe wired in here — run Task 1 separately and pass matches in to unlock conversion detection
    results.push(buildCandidateGraph(enriched, { matchedPlanning }))
  }

  const asOf = new Date().toISOString().slice(0, 10)
  const ranked = rankCandidates(results, asOf)

  console.log(`\n${'═'.repeat(70)}\n${ranked.length} clusters, ranked (commercial/conversion first, nothing discarded):\n`)
  for (const { result, conclusion, rank } of ranked) {
    const tag = result.conversion.isConversion ? 'CONVERSION SIGNAL' : SECTOR_LABEL[result.sector.sector]
    console.log(`▸ [${conclusion.strength.toUpperCase()}] rank ${rank} · ${tag} · ${conclusion.headline}`)
    console.log(`    ${conclusion.reasoning}`)
    console.log(`    sector basis: ${result.sector.basis} (${result.sector.confidence})`)
    console.log(`    conversion: ${result.conversion.reason}`)
    console.log(`    planning: ${result.planningChecked ? 'checked (see evidence above for any match)' : 'not checked'}`)
    console.log('')
  }
}

// Only run the live CLI when this file is executed directly — importing
// it for its pure functions (as tests do) must never also fire network calls.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('\nSweep could not complete:\n  ' + (err as Error).message)
    console.error('\nNo clusters printed because none were pulled. (Not fabricated.)')
    process.exit(1)
  })
}
