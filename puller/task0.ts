/*
  Task 0 — Southwark Bridge Road validation, end to end.
  Run: node --env-file=.env --experimental-strip-types puller/task0.ts

  Prints the headline plainly: "the public record showed this N days before
  the trade press did." When the target names a confirmed applicant, the
  headline is tied to THAT entity by exact-name match — not to whichever
  candidate happens to have the longest lead. If the network or key is
  unavailable it fails LOUDLY and prints nothing that could be mistaken for a
  real result — a fabricated lead time is worse than no answer.
*/

import {
  companyProfile,
  filingHistory,
  namesMatch,
  pickCompanyName,
  searchCompanies,
  NAME_UNAVAILABLE,
} from './companiesHouse.ts'
import { isLLPNumber, summariseLeadTime, type LeadTimeResult } from './leadTime.ts'
import { SOUTHWARK_BRIDGE_ROAD as T } from '../signal-model/targets.ts'

const WINDOW_DAYS = 730

/** Authoritative name from the company profile, falling back to the search name. */
async function resolveName(number: string, searchName?: string): Promise<string> {
  const fromSearch = searchName?.trim()
  if (fromSearch && fromSearch !== NAME_UNAVAILABLE) return fromSearch
  try {
    return pickCompanyName((await companyProfile(number)).company_name, searchName)
  } catch {
    return pickCompanyName(searchName)
  }
}

interface Candidate {
  number: string
  name: string
  isLLP: boolean
  summary: LeadTimeResult
}

async function main() {
  console.log(`Task 0 — ${T.address}, ${T.borough}`)
  console.log(`Claim: ${T.claim}`)
  if (T.applicant) console.log(`Confirmed applicant: ${T.applicant}`)
  console.log('')

  // Step 1 — find candidate companies from the configured search terms.
  const seen = new Map<string, string>() // number → search name
  for (const term of T.companiesHouseSearch) {
    const hits = await searchCompanies(term)
    for (const h of hits) seen.set(h.company_number, h.company_name)
    console.log(`  search "${term}" → ${hits.length} companies`)
  }
  if (seen.size === 0) {
    console.log('\nNo candidate companies found. Check the exact registered name on Companies House.')
    return
  }

  // Steps 2–3 — pull filing history and find ownership-change filings.
  const candidates: Candidate[] = []
  for (const [number, searchName] of seen) {
    const isLLP = isLLPNumber(number)
    const filings = await filingHistory(number)
    const summary = summariseLeadTime(filings, T.pressBaseline, WINDOW_DAYS, { isLLP })
    const name = await resolveName(number, searchName)
    candidates.push({ number, name, isLLP, summary })
    if (summary.drivingFiling && summary.leadTimeDays !== null) {
      console.log(
        `  ${name} (${number})${isLLP ? ' [LLP]' : ''}: ${summary.drivingFiling.date} ` +
          `(${summary.drivingFiling.category}) → ${summary.leadTimeDays} days before press`,
      )
    }
  }

  // Step 4 — the headline, tied to the confirmed applicant when we have one.
  console.log('\n' + '─'.repeat(64))
  const applicant = T.applicant ? candidates.find((c) => namesMatch(c.name, T.applicant)) : undefined

  if (T.applicant && !applicant) {
    console.log(
      `Applicant "${T.applicant}" was not in the search results.\n` +
        `Check the exact registered name/number on Companies House, then update the target's search terms.`,
    )
    return
  }

  const chosen = applicant ?? pickLongestLead(candidates)

  if (!chosen || !chosen.summary.drivingFiling || chosen.summary.leadTimeDays === null) {
    const who = chosen ? `${chosen.name} (${chosen.number})` : 'any candidate'
    console.log(
      `No ownership-change filing for ${who} within ${WINDOW_DAYS} days before ${T.pressBaseline}.\n` +
        `A valid kill — the change was filed differently, outside the window, or the entity is wrong.`,
    )
    if (chosen && chosen.summary.candidates.length) {
      console.log('\n  All ownership-change filings seen for this entity (for eyeballing):')
      for (const f of chosen.summary.candidates) console.log(`    ${f.date}  ${f.category}`)
    }
    return
  }

  const d = chosen.summary.drivingFiling
  console.log(
    `HEADLINE: the public record showed this ${chosen.summary.leadTimeDays} days before the trade press.\n` +
      `  Entity:         ${chosen.name} (${chosen.number})${chosen.isLLP ? ' [LLP]' : ''}\n` +
      `  Driving filing: ${d.date} · ${d.category}\n` +
      `  Press baseline: ${T.pressBaseline} (Building magazine, June 2026)`,
  )
  if (chosen.summary.candidates.length > 1) {
    console.log('\n  Other ownership-change filings for this entity:')
    for (const f of chosen.summary.candidates) {
      if (f !== d) console.log(`    ${f.date}  ${f.category}`)
    }
  }
}

function pickLongestLead(candidates: Candidate[]): Candidate | undefined {
  return candidates
    .filter((c) => c.summary.leadTimeDays !== null)
    .sort((a, b) => (b.summary.leadTimeDays ?? 0) - (a.summary.leadTimeDays ?? 0))[0]
}

main().catch((err) => {
  console.error('\nTask 0 could not complete:\n  ' + (err as Error).message)
  console.error('\nNo lead-time number is printed because none was measured. (Not fabricated.)')
  process.exit(1)
})
