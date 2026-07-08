export type Sector = 'office-retrofit' | 'pbsa-living'

export const SECTOR_LABEL: Record<Sector, string> = {
  'office-retrofit': 'Office retrofit',
  'pbsa-living': 'PBSA / living',
}

export type SourceType =
  | 'Planning'
  | 'RFP'
  | 'Award'
  | 'Market signal'
  | 'Event signal'
  | 'Manual research'
  | 'Internal relationship'
  | 'Press/news'
  | 'Regeneration prospectus'

export const SOURCE_TYPES: SourceType[] = [
  'Planning',
  'RFP',
  'Award',
  'Market signal',
  'Event signal',
  'Manual research',
  'Internal relationship',
  'Press/news',
  'Regeneration prospectus',
]

export type Status =
  | 'Watch'
  | 'Research'
  | 'Discuss internally'
  | 'Approach'
  | 'No action'
  | 'Dormant'
  | 'Converted'
  | 'Closed'

export const STATUSES: Status[] = [
  'Watch',
  'Research',
  'Discuss internally',
  'Approach',
  'No action',
  'Dormant',
  'Converted',
  'Closed',
]

/** Statuses that represent live leads (used for review flags and counts). */
export const ACTIVE_STATUSES: Status[] = [
  'Watch',
  'Research',
  'Discuss internally',
  'Approach',
]

export type RfpClassification =
  | 'Bid now'
  | 'Watch buyer'
  | 'Framework route'
  | 'Competitor intelligence'
  | 'Too late'
  | 'Not relevant'

export const RFP_CLASSIFICATIONS: RfpClassification[] = [
  'Bid now',
  'Watch buyer',
  'Framework route',
  'Competitor intelligence',
  'Too late',
  'Not relevant',
]

/** Pre-RFP signal families surfaced in the signal monitor. */
export type SignalKind =
  | 'Planning application'
  | 'Planning amendment'
  | 'Refusal'
  | 'Stalled scheme'
  | 'Asset repositioning'
  | 'Office-to-living potential'
  | 'PBSA / living feasibility'
  | 'Regeneration site'

export interface ScoreBreakdown {
  sectorFit: number // 1–5
  stageTiming: number // 1–5
  architecturalProblem: number // 1–5
  feePotential: number // 1–5
  relationshipRoute: number // 1–5
  urgency: number // 1–5
}

export const SCORE_CRITERIA: { key: keyof ScoreBreakdown; label: string }[] = [
  { key: 'sectorFit', label: 'Sector fit' },
  { key: 'stageTiming', label: 'Stage timing' },
  { key: 'architecturalProblem', label: 'Architectural problem' },
  { key: 'feePotential', label: 'Fee potential' },
  { key: 'relationshipRoute', label: 'Relationship route' },
  { key: 'urgency', label: 'Urgency' },
]

/**
 * AI-assisted brief. Rendered as assistance, never as fact — every field is
 * expected to be checked against the opportunity's source link.
 */
export interface AiBrief {
  executiveSummary: string
  classification: string
  likelyIssue: string
  commercialRelevance: string
  recommendedAction: string
  confidenceNote: string
  falsePositiveRisk: string
}

export interface RfpDetail {
  classification: RfpClassification
  buyer: string
  deadline?: string // ISO date
  portal: string
}

export interface Opportunity {
  id: string
  name: string
  sector: Sector
  borough: string
  address: string
  client: string
  sourceType: SourceType
  sourceLabel: string
  sourceLink: string
  reference: string
  stage: string
  signalKind?: SignalKind
  /** 1 — What is the signal? */
  signalSummary: string
  /** 3 — The possible architectural problem. */
  architecturalIssue: string
  /** 2 — Why it might matter / the angle in. */
  opportunityAngle: string
  /** 4 — Why it is relevant to the practice. */
  relevance: string
  /** 5 — What should happen next. */
  nextAction: string
  status: Status
  scores: ScoreBreakdown
  /** 0–100. Shown separately; never feeds the opportunity score. */
  confidence: number
  notes: string
  owner: string
  dateAdded: string // ISO date
  lastReviewed: string // ISO date
  ai: AiBrief
  rfp?: RfpDetail
}

/** RFP-monitor rows that are tracked but not (or not yet) opportunity cards. */
export interface RfpWatchItem {
  id: string
  title: string
  buyer: string
  sector: Sector | 'other'
  classification: RfpClassification
  deadline?: string
  portal: string
  note: string
  opportunityId?: string
}

export interface ActivityEntry {
  date: string // ISO date
  text: string
  opportunityId?: string
}
