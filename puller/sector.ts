/*
  Sector tagging for the wider sweep — HEURISTIC, and labelled as such.

  Companies House SIC codes (68100/68209/68320/41100) only say "this is a
  real-estate business" — they are far too coarse to say office vs. student
  housing vs. co-living vs. resi. That distinction genuinely isn't available
  at the moment an SPV is discovered; it comes from what the SPV is FOR,
  which name-pattern hints at loosely and a planning application confirms
  properly. So: infer a sector tag from the company name (a real, if weak,
  public signal — companies are very often named after their scheme type),
  default to the brief's primary target (commercial office) when nothing
  else is indicated, and mark every tag `confidence: 'heuristic'` so nothing
  downstream mistakes this for a filed fact. Only a planning-application
  signal (LAYER_CATEGORY 'planningApplication'/'planningApplicant', once
  pulled per-building) would upgrade a tag to 'confirmed'.
*/

export type Sector = 'commercialOffice' | 'studentHousing' | 'coLiving' | 'resi' | 'mixedUse'

export const SECTOR_LABEL: Record<Sector, string> = {
  commercialOffice: 'Commercial office',
  studentHousing: 'Student housing',
  coLiving: 'Co-living',
  resi: 'Residential',
  mixedUse: 'Mixed-use',
}

export interface SectorTag {
  sector: Sector
  confidence: 'heuristic' | 'confirmed'
  /** What in the name (or later, filing) triggered this tag — for the human to judge. */
  basis: string
}

const NAME_HINTS: { pattern: RegExp; sector: Sector }[] = [
  { pattern: /\bstudent\b/i, sector: 'studentHousing' },
  { pattern: /\bco-?living\b/i, sector: 'coLiving' },
  { pattern: /\bbuild.?to.?rent\b|\bbtr\b|\bresidential\b|\bapartments?\b|\bhomes?\b/i, sector: 'resi' },
  { pattern: /\boffice(s)?\b|\bworkspace\b|\bcommercial\b/i, sector: 'commercialOffice' },
]

/** Infer a sector tag from a company name alone. Always heuristic — never
 *  claim 'confirmed' without a planning-derived signal (not available here). */
export function inferSectorFromName(companyName: string): SectorTag {
  for (const { pattern, sector } of NAME_HINTS) {
    if (pattern.test(companyName)) {
      return { sector, confidence: 'heuristic', basis: `name matches /${pattern.source}/` }
    }
  }
  // Per the brief: primary target is commercial office, but an unhinted name
  // is genuinely ambiguous, not confidently "office" — tag mixed-use rather
  // than quietly assuming the brief's preferred sector.
  return { sector: 'mixedUse', confidence: 'heuristic', basis: 'no name hint — defaulted, not inferred' }
}

/** Rank order for the showcase: commercial office and conversions (office
 *  name hints combined with a non-office scheme signal) lead; the rest is
 *  "wider picture", per the brief — surfaced, not discarded. */
export function sectorRank(sector: Sector, isConversion: boolean): number {
  if (isConversion) return 0 // strongest work-winning lead: office repositioning to resi/student/co-living
  if (sector === 'commercialOffice') return 1
  return 2 // wider picture — still shown, just not the headline
}

export interface ConversionCheck {
  isConversion: boolean
  reason: string
}

/**
 * A conversion/use-class-change signal: the registered address previously
 * carried a LARGE COMMERCIAL EPC record (prior office/commercial use, per
 * Task 1's own isLargeCommercial filter), but the newly-discovered SPV's
 * name hints at a non-office scheme (resi/student/co-living) — the exact
 * shape of the seed case itself (office pivoting to co-living).
 *
 * Requires a Task-1-derived EPC match to say anything at all; without one
 * this returns isConversion: false with an explicit "unconfirmed" reason —
 * never a guess dressed as a finding.
 */
export function checkConversionSignal(
  newSpvSector: SectorTag,
  matchedPriorUse: { isLargeCommercial: boolean } | null,
): ConversionCheck {
  if (!matchedPriorUse) {
    return { isConversion: false, reason: 'unconfirmed — no EPC/VOA prior-use record matched (Task 1 not run for this address)' }
  }
  if (matchedPriorUse.isLargeCommercial && newSpvSector.sector !== 'commercialOffice') {
    return {
      isConversion: true,
      reason: `prior use was large commercial (EPC) and the new SPV's name hints ${SECTOR_LABEL[newSpvSector.sector]} — a probable conversion`,
    }
  }
  return { isConversion: false, reason: 'prior use and new scheme hint the same broad category — no conversion signal' }
}
