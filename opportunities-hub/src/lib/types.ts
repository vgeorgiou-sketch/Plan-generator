export type Sector = 'Office' | 'Living'

export const SECTORS: Sector[] = ['Office', 'Living']

export const SUB_SECTORS: Record<Sector, string[]> = {
  Office: [
    'New build office',
    'Office retrofit',
    'Office repositioning',
    'Office extension',
    'Workplace / HQ',
    'Commercial mixed-use',
    'Stranded office asset',
    'Office-to-living potential',
  ],
  Living: [
    'PBSA',
    'BTR',
    'Co-living',
    'Residential-led',
    'Student accommodation',
    'Hotel-to-living',
    'Office-to-living',
    'Mixed-use living',
  ],
}

export const CITIES = ['London', 'Birmingham', 'Manchester', 'Bristol'] as const
export type City = (typeof CITIES)[number]

export const SOURCE_TYPES = [
  'Planning',
  'RFP',
  'Contract award',
  'Market article',
  'Regeneration prospectus',
  'Company/developer signal',
  'Event signal',
  'Manual intelligence',
  'CSV import',
  'Pasted URL',
] as const
export type SourceType = (typeof SOURCE_TYPES)[number]

export const REVIEW_STATUSES = [
  'Unreviewed',
  'Needs review',
  'Watch',
  'Convert to opportunity',
  'Ignored',
] as const
export type ReviewStatus = (typeof REVIEW_STATUSES)[number]

export const OPPORTUNITY_STATUSES = [
  'Watch',
  'Research',
  'Discuss internally',
  'Approach',
  'Live conversation',
  'Bid/RFP',
  'Dormant',
  'Closed',
] as const
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number]

/** Statuses that count as a live pipeline lead. */
export const ACTIVE_OPPORTUNITY_STATUSES: OpportunityStatus[] = [
  'Watch',
  'Research',
  'Discuss internally',
  'Approach',
  'Live conversation',
  'Bid/RFP',
]

export type AiStatus = 'Auto-classified' | 'Pending' | 'Manual entry'

export interface RawSignal {
  id: string
  title: string
  city: City
  district: string
  sectorGuess: Sector
  subSectorGuess: string
  sourceType: SourceType
  sourceLink: string
  rawSummary: string
  dateFound: string // ISO date
  aiStatus: AiStatus
  /** One-line mocked-AI rationale: why this was surfaced. */
  aiNote: string
  reviewStatus: ReviewStatus
  /** 1–5 evidence scale. */
  confidence: number
  linkedOpportunityId?: string
}

export interface ScoreBreakdown {
  sectorFit: number
  geographyFit: number
  stageTiming: number
  architecturalProblem: number
  feePotential: number
  relationshipRoute: number
  urgency: number
}

export const SCORE_CRITERIA: { key: keyof ScoreBreakdown; label: string; hint: string }[] = [
  { key: 'sectorFit', label: 'Sector fit', hint: 'Match to Office / Living focus and sub-sectors' },
  { key: 'geographyFit', label: 'Geography fit', hint: 'Match to target cities and travel-to-work reach' },
  { key: 'stageTiming', label: 'Stage timing', hint: 'How early we are relative to design procurement' },
  { key: 'architecturalProblem', label: 'Architectural problem', hint: 'Is there a design problem we are equipped to solve?' },
  { key: 'feePotential', label: 'Fee potential', hint: 'Likely commission scale if won' },
  { key: 'relationshipRoute', label: 'Relationship route', hint: 'Warmth and directness of the route to the client' },
  { key: 'urgency', label: 'Urgency', hint: 'How quickly the window closes' },
]

export const CONFIDENCE_LEVELS: { value: number; label: string }[] = [
  { value: 1, label: 'Weak evidence' },
  { value: 2, label: 'Limited evidence' },
  { value: 3, label: 'Reasonable evidence' },
  { value: 4, label: 'Strong evidence' },
  { value: 5, label: 'Source-backed and highly relevant' },
]

export interface Opportunity {
  id: string
  name: string
  city: City
  district: string
  address: string
  sector: Sector
  subSector: string
  client: string
  sourceType: SourceType
  sourceLink: string
  reference: string
  stage: string
  /** 1 — What is the signal? */
  signalSummary: string
  /** 3 — The likely architectural opportunity. */
  architecturalIssue: string
  /** 2 — Why it might matter. */
  opportunityAngle: string
  /** 4a — Relevance to the practice. */
  relevance: string
  /** 4b — Commercial reason to care. */
  commercialReason: string
  /** 5 — What should happen next. */
  nextAction: string
  status: OpportunityStatus
  scores: ScoreBreakdown
  /** 1–5. Shown separately; never adds to the score. */
  confidence: number
  owner: string
  notes: string
  dateAdded: string
  lastReviewed: string
  fromSignalId?: string
}

export interface ActivityEntry {
  date: string
  text: string
  href?: string
}
