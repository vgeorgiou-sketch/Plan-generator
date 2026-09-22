/*
  The first REAL Cluster — 38–48 Southwark Bridge Road, as a graph.

  Built directly FROM ../signal-model/seed.ts (single source of truth — no
  re-typed dates/URLs to drift out of sync). This is the reference cluster
  the wider Southwark sweep's new clusters get compared against.

  What's asserted vs. what isn't:
    - 'owns' (OC455308 → building): the SPV's legal name ("Southwark Bridge
      Road LLP") matches the planning applicant's name exactly — two
      independent public sources agreeing. Strong, but it is a name-match
      inference, not a single title-deed document naming the owner, so the
      edge confidence is 0.9, not 1.0, even though both underlying Signals
      are individually filed at 1.0. (Edge confidence reflects confidence in
      the LINK, which can differ from either endpoint's own confidence.)
    - 'controls' (Hub Living / Bridges GP → OC455308): both directly filed on
      OC455308's own PSC register. Confidence 1.0.
    - 'operates' (HUB → building): directly stated in the planning
      application. Confidence 1.0. NOTE: this "HUB" (operator, per the
      application) is deliberately kept as a SEPARATE node from the company
      "Hub Living Developments Limited" (per the PSC register) — no edge
      asserts they're the same legal entity, because that identity match is
      not itself confirmed by a filed source. Let a human eyeball it.
    - NO chargeHolder edge: the mortgage signal (sbr-charge) doesn't name a
      lender — Companies House's charges LIST endpoint gives dates/status,
      not the chargee's name; that needs the charge DETAIL endpoint, not yet
      pulled. The charge still counts as a node-level signal (see below), it
      just isn't drawn as a lender edge until a name can be cited.
    - NO priorOwner edge for UBS Asset Management: named only in
      ../signal-model/targets.ts's knownEvents, explicitly flagged there as
      unconfirmed ("confirm via Southwark planning register") — not yet a
      filed Signal, so not yet a graph edge either.

  On dates: `SBR_ANALYSIS_ASOF` is NOT the press baseline. It's set to
  shortly after this cluster's own kinetic activity (the April 2025
  mortgage), representing the moment a live-running sweep would have
  surfaced it — a year before the June 2026 press pivot. Scoring recency
  against the (much later) press date would call fresh 2025 signals "stale"
  by 2026 standards, which defeats the whole point of a pre-disclosure alert
  tool. See ./conclusion.ts's file header for the general rule.
*/

import { SOUTHWARK_BRIDGE_ROAD_SEED as SEED, SBR_PRESS_BASELINE } from '../signal-model/seed.ts'
import type { Graph, GraphEdge, GraphNode } from './types.ts'

function signal(id: string) {
  const s = SEED.signals.find((s) => s.id === id)
  if (!s) throw new Error(`seed signal not found: ${id}`) // fail loudly — never silently drop provenance
  return s
}

const applicant = signal('sbr-applicant')
const spv = signal('sbr-spv')
const pscHubCeased = signal('sbr-psc-hub-ceased')
const pscBridgesActive = signal('sbr-psc-bridges-active')
const charge = signal('sbr-charge')
const press = signal('sbr-press')

const BUILDING_ID = SEED.id
const OC455308_ID = 'company:OC455308'
const HUB_LIVING_ID = 'company:hub-living-developments-ltd'
const BRIDGES_GP_ID = 'company:bridges-property-alternatives-fund-vi-gp-llp'
const HUB_OPERATOR_ID = 'developer:hub-operator'

const buildingNode: GraphNode = {
  id: BUILDING_ID,
  type: 'building',
  label: SEED.address,
  signals: [press, applicant], // building-level facts: the press pivot, and the anchor applicant record
}

const spvCompanyNode: GraphNode = {
  id: OC455308_ID,
  type: 'company',
  label: 'Southwark Bridge Road LLP (OC455308)',
  signals: [spv, pscHubCeased, pscBridgesActive, charge], // everything filed against OC455308 itself
  sourceUrl: spv.sourceUrl,
}

const hubLivingNode: GraphNode = {
  id: HUB_LIVING_ID,
  type: 'company',
  label: 'Hub Living Developments Limited',
  signals: [], // no signals filed directly against IT in current data — only cited via the PSC edge below
  sourceUrl: pscHubCeased.sourceUrl,
}

const bridgesGpNode: GraphNode = {
  id: BRIDGES_GP_ID,
  type: 'company',
  label: 'Bridges Property Alternatives Fund VI GP LLP',
  signals: [],
  sourceUrl: pscBridgesActive.sourceUrl,
}

const hubOperatorNode: GraphNode = {
  id: HUB_OPERATOR_ID,
  type: 'developer',
  label: 'HUB (operator, per planning application)',
  signals: [],
  sourceUrl: applicant.sourceUrl,
}

const edges: GraphEdge[] = [
  {
    from: OC455308_ID,
    to: BUILDING_ID,
    type: 'owns',
    sourceUrl: applicant.sourceUrl, // the document tying the named LLP to THIS address
    observedAt: applicant.observedAt,
    confidence: 0.9, // name-match across two independent sources, not a single title-deed citation
  },
  {
    from: HUB_LIVING_ID,
    to: OC455308_ID,
    type: 'controls',
    sourceUrl: pscHubCeased.sourceUrl,
    observedAt: pscHubCeased.observedAt,
    confidence: pscHubCeased.confidence,
  },
  {
    from: BRIDGES_GP_ID,
    to: OC455308_ID,
    type: 'controls',
    sourceUrl: pscBridgesActive.sourceUrl,
    observedAt: pscBridgesActive.observedAt,
    confidence: pscBridgesActive.confidence,
  },
  {
    from: HUB_OPERATOR_ID,
    to: BUILDING_ID,
    type: 'operates',
    sourceUrl: applicant.sourceUrl,
    observedAt: applicant.observedAt,
    confidence: applicant.confidence,
  },
]

export const SOUTHWARK_BRIDGE_ROAD_GRAPH: Graph = {
  nodes: [buildingNode, spvCompanyNode, hubLivingNode, bridgesGpNode, hubOperatorNode],
  edges,
}

/** When a live sweep would have surfaced this cluster — NOT the press date. See file header. */
export const SBR_ANALYSIS_ASOF = '2025-06-01'

/** Re-exported for callers that need the actual disclosure date for the lead-time metric. */
export const SBR_DISCLOSURE_DATE = SBR_PRESS_BASELINE
