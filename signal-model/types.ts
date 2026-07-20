/*
  Opportunity Radar — canonical signal data model.

  One model, built on provenance and convergence rather than additive scores.
  Core rule: every number on screen must trace to a specific source record.
  If a field can't cite where it came from, it doesn't go on the card.

  This module is framework-agnostic TypeScript, imported by both the puller
  (Node) and the grid (frontend). It replaces the two conflicting scoring
  systems (src/radar/model.ts 6×5=30, opportunities-hub 7×5=35) — see
  ./README.md for the migration status.
*/

export type SignalLayer =
  | 'epc' // EPC Open Data — rating, floor area, use
  | 'voa' // VOA business rates list — floor area, use, rateable value
  | 'landRegistryTitle' // Title register — proprietor, registered lease
  | 'landRegistryOwnership' // Corporate ownership bulk dataset
  | 'companiesHouseSpv' // New incorporation matching address/name
  | 'companiesHouseCharge' // Mortgage/debenture filed or satisfied
  | 'planningApplication' // Planning London Datahub / Southwark Public Access
  | 'buildingControlDemolition' // S80/81 demolition notice
  | 'pressReport' // Trade press (Building, EGi, etc.) — always lowest trust

/** Canonical column order for the grid, densest-provenance first. */
export const SIGNAL_LAYERS: SignalLayer[] = [
  'epc',
  'voa',
  'landRegistryTitle',
  'landRegistryOwnership',
  'companiesHouseSpv',
  'companiesHouseCharge',
  'planningApplication',
  'buildingControlDemolition',
  'pressReport',
]

export const LAYER_LABEL: Record<SignalLayer, string> = {
  epc: 'EPC',
  voa: 'VOA rates',
  landRegistryTitle: 'Title register',
  landRegistryOwnership: 'Corp. ownership',
  companiesHouseSpv: 'New SPV',
  companiesHouseCharge: 'Charge',
  planningApplication: 'Planning',
  buildingControlDemolition: 'Demolition',
  pressReport: 'Press',
}

export type FactType =
  | 'filed' // directly stated in the source document (e.g. EPC rating on certificate)
  | 'derived' // computed from filed facts (e.g. lease expiry = start + term)
  | 'inferred' // pattern-matched, not certain (e.g. SPV name looks like this address)

export interface Signal {
  id: string // uuid
  buildingId: string // FK to Opportunity
  layer: SignalLayer
  factType: FactType
  label: string // human-readable, e.g. "EPC rating: E"
  value: string | number // the actual data point
  sourceUrl: string // MUST be a real, working link to the primary record
  sourceRef?: string // e.g. Companies House filing ref, planning application no.
  observedAt: string // ISO date the underlying event happened (filing date, cert date)
  retrievedAt: string // ISO date we pulled it — staleness check
  confidence: number // 0–1. Filed = 1.0. Derived = based on assumptions made.
  note?: string // e.g. "lease term registered; break clause may apply earlier"
}

export type OpportunityStatus = 'new' | 'reviewing' | 'confirmed' | 'dismissed'

export interface Opportunity {
  id: string
  address: string
  postcode: string
  borough: string
  floorArea?: number // m², from EPC or VOA — flag which one in signals
  signals: Signal[] // full evidence list, not a summary
  lastReviewed?: string // ISO date — from confirmation ledger, not auto-set
  status: OpportunityStatus
}

export type LayerCategory = 'pressure' | 'kinetic' | 'context'

export const LAYER_CATEGORY: Record<SignalLayer, LayerCategory> = {
  epc: 'pressure',
  voa: 'context',
  landRegistryTitle: 'pressure',
  landRegistryOwnership: 'context',
  companiesHouseSpv: 'kinetic',
  companiesHouseCharge: 'kinetic',
  planningApplication: 'kinetic',
  buildingControlDemolition: 'kinetic',
  pressReport: 'context', // informative but never counts toward convergence — it's already public
}

export interface ConvergenceResult {
  pressureLayers: number // distinct pressure-category layers present
  kineticLayers: number // distinct kinetic-category layers present
  isConverged: boolean // true only if >=1 pressure AND >=1 kinetic layer fired
  minConfidence: number // lowest confidence among contributing signals — the weak link
  leadTimeDays?: number // observedAt of earliest kinetic signal vs asOf date, if calculable
}

export type GridCellState = 'empty' | 'filed' | 'derived' | 'inferred'

export interface GridCell {
  buildingId: string
  layer: SignalLayer
  state: GridCellState // drives cell styling
  signalId?: string // FK to the Signal, for the click-through
  tooltip: string // short human summary, e.g. "Charge registered 03/2026"
}

export interface ConfirmationEntry {
  id: string
  buildingId: string
  action: 'confirmed' | 'dismissed'
  reason?: string // free text, optional — why dismissed matters more than why confirmed
  actor: string // who clicked it
  actedAt: string // ISO date
}
