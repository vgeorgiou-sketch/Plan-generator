/*
  Task 2 — scan for newly-incorporated real-estate SPVs in Southwark.
  Runs advanced search once per SIC code and merges (the API does not reliably
  OR multiple codes — verify per code). Produces kinetic hits.
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

/** Task 2 end to end — returns de-duplicated kinetic SPV hits. */
export async function scanNewSpvs(opts?: { location?: string; monthsBack?: number }): Promise<KineticHit[]> {
  const location = opts?.location ?? 'southwark'
  const incorporatedFrom = isoMonthsAgo(opts?.monthsBack ?? 12)
  const seen = new Map<string, CompanyHit>()

  for (const sic of REAL_ESTATE_SIC) {
    const hits = await advancedSearch({ sicCodes: sic, location, incorporatedFrom, companyStatus: 'active' })
    for (const h of hits) seen.set(h.company_number, h)
  }

  return [...seen.values()].map(spvToHit)
}
