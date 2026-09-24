/*
  Task 2 / Part 1 shared discovery — newly-incorporated real-estate entities
  in Southwark. Runs advanced search once per SIC code and merges (the API
  does not reliably OR multiple codes — verify per code).

  findSouthwarkRealEstateCandidates() is the raw discovery step, reused by:
    - scanNewSpvs() here (Task 2): maps straight to bare kinetic hits.
    - sweep.ts (Part 1): pulls full enrichment (PSC/charges/officers/filing
      history) per candidate and builds a graph cluster.
  One source of truth for "how we find candidates" — no drift between them.
*/

import { advancedSearch, type CompanyHit } from './companiesHouse.ts'
import { spvToHit } from './kineticSignals.ts'
import type { KineticHit } from './crossReference.ts'

/** Real-estate SIC codes worth watching. */
export const REAL_ESTATE_SIC = ['68100', '68209', '68320', '41100']

/** Southwark postcode districts (confirm the full list before production). */
export const SOUTHWARK_DISTRICTS = ['SE1', 'SE5', 'SE15', 'SE16', 'SE17', 'SE21', 'SE22', 'SE24']

function isoMonthsAgo(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - months)
  return d.toISOString().slice(0, 10)
}

/**
 * Structured discovery: SIC codes × location × recent incorporation date —
 * NOT keyword guessing. This is the legitimate half of Companies House
 * search; the standing "anchor to confirmed entities" rule (task0.ts) is
 * about a DIFFERENT failure mode — accepting a free-text name-guess as the
 * answer for a specific, already-known building. Here there is no building
 * yet to anchor to; discovering candidates via structured filters is the
 * whole point of this step, and every hit still gets fully enriched (never
 * taken on faith) before it's shown to anyone.
 */
export async function findSouthwarkRealEstateCandidates(opts?: {
  location?: string
  monthsBack?: number
}): Promise<CompanyHit[]> {
  const location = opts?.location ?? 'southwark'
  const incorporatedFrom = isoMonthsAgo(opts?.monthsBack ?? 12)
  const seen = new Map<string, CompanyHit>()

  for (const sic of REAL_ESTATE_SIC) {
    const hits = await advancedSearch({ sicCodes: sic, location, incorporatedFrom, companyStatus: 'active' })
    for (const h of hits) seen.set(h.company_number, h)
  }

  return [...seen.values()]
}

/** Task 2 end to end — returns de-duplicated kinetic SPV hits. */
export async function scanNewSpvs(opts?: { location?: string; monthsBack?: number }): Promise<KineticHit[]> {
  const candidates = await findSouthwarkRealEstateCandidates(opts)
  return candidates.map(spvToHit)
}
