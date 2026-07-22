/*
  Task 0 — Southwark Bridge Road validation, end to end.
  Run: node --env-file=.env --experimental-strip-types puller/task0.ts

  When the target pins a confirmed company number, Task 0 pulls THAT company
  directly (no keyword search — that caused a false positive) and computes the
  lead-time from its own filing history, then reads the PSC register to see who
  controls it. If the network or key is unavailable it fails LOUDLY and prints
  nothing that could be mistaken for a real result.
*/

import {
  companyProfile,
  filingHistory,
  findControllers,
  namesMatch,
  personsWithSignificantControl,
  pickCompanyName,
  searchCompanies,
  NAME_UNAVAILABLE,
  type PscItem,
} from './companiesHouse.ts'
import { isLLPNumber, summariseLeadTime, type LeadTimeResult } from './leadTime.ts'
import { SOUTHWARK_BRIDGE_ROAD as T } from '../signal-model/targets.ts'

const WINDOW_DAYS = 730

async function resolveName(number: string, searchName?: string): Promise<string> {
  const fromSearch = searchName?.trim()
  if (fromSearch && fromSearch !== NAME_UNAVAILABLE) return fromSearch
  try {
    return pickCompanyName((await companyProfile(number)).company_name, searchName)
  } catch {
    return pickCompanyName(searchName)
  }
}

/** Print the lead-time headline and PSC check for one confirmed company. */
async function analyseCompany(number: string): Promise<void> {
  const isLLP = isLLPNumber(number)
  const profile = await companyProfile(number)
  const name = pickCompanyName(profile.company_name)
  const filings = await filingHistory(number)
  const summary = summariseLeadTime(filings, T.pressBaseline, WINDOW_DAYS, { isLLP })

  console.log(`Entity: ${name} (${number})${isLLP ? ' [LLP]' : ''}`)
  if (profile.date_of_creation) {
    const corroborates = T.incorporatedOn && profile.date_of_creation === T.incorporatedOn
    console.log(`  Incorporated: ${profile.date_of_creation}${corroborates ? ' ✓ matches confirmed date' : ''}`)
  }

  reportLeadTime(summary)
  await reportPsc(number)
}

function reportLeadTime(summary: LeadTimeResult): void {
  console.log('\n' + '─'.repeat(64))
  const d = summary.drivingFiling
  if (!d || summary.leadTimeDays === null) {
    console.log(
      `No ownership-change filing within ${WINDOW_DAYS} days before ${T.pressBaseline}.\n` +
        `A valid kill — the change was filed differently or outside the window.`,
    )
    if (summary.candidates.length) {
      console.log('\n  Ownership-change filings seen (for eyeballing):')
      for (const f of summary.candidates) console.log(`    ${f.date}  ${f.category}`)
    }
    return
  }
  console.log(
    `HEADLINE: the public record showed this ${summary.leadTimeDays} days before the trade press.\n` +
      `  Driving filing: ${d.date} · ${d.category}\n` +
      `  Press baseline: ${T.pressBaseline} (Building magazine, June 2026)`,
  )
  if (summary.candidates.length > 1) {
    console.log('\n  Other ownership-change filings for this entity:')
    for (const f of summary.candidates) if (f !== d) console.log(`    ${f.date}  ${f.category}`)
  }
}

async function reportPsc(number: string): Promise<void> {
  let pscs: PscItem[] = []
  try {
    pscs = await personsWithSignificantControl(number)
  } catch (err) {
    console.log(`\nPSC register could not be read: ${(err as Error).message}`)
    return
  }

  console.log('\nPSC — persons with significant control:')
  if (pscs.length === 0) {
    console.log('  (none listed — the company may use a PSC statement instead, or none is registered)')
  }
  for (const p of pscs) {
    const ceased = p.ceased_on ? ` (ceased ${p.ceased_on})` : ''
    const natures = p.natures_of_control?.length ? ` · ${p.natures_of_control.join(', ')}` : ''
    console.log(`  - ${p.name ?? '(unnamed)'}${ceased}${natures}`)
  }

  const needles = T.controllersOfInterest ?? []
  if (needles.length) {
    console.log('\n  Controllers of interest:')
    const matches = findControllers(
      pscs.map((p) => p.name ?? ''),
      needles,
    )
    for (const m of matches) {
      console.log(`  ${m.named ? '✓' : '✗'} ${m.needle}: ${m.named ? 'named — ' + m.matchedBy.join('; ') : 'not named in the PSC register'}`)
    }
  }
}

/** Fallback path when no company number is pinned — keyword search. */
async function analyseBySearch(): Promise<void> {
  const seen = new Map<string, string>()
  for (const term of T.companiesHouseSearch) {
    const hits = await searchCompanies(term)
    for (const h of hits) seen.set(h.company_number, h.company_name)
    console.log(`  search "${term}" → ${hits.length} companies`)
  }
  if (seen.size === 0) {
    console.log('\nNo candidate companies found. Check the exact registered name on Companies House.')
    return
  }
  // Prefer an exact applicant-name match if the target names one.
  for (const [number, searchName] of seen) {
    const name = await resolveName(number, searchName)
    if (T.applicant && namesMatch(name, T.applicant)) {
      await analyseCompany(number)
      return
    }
  }
  console.log(
    `\nApplicant "${T.applicant ?? '(unset)'}" not found among search results.\n` +
      `Confirm the exact number on Companies House and set companyNumber in the target.`,
  )
}

async function main() {
  console.log(`Task 0 — ${T.address}, ${T.borough}`)
  console.log(`Claim: ${T.claim}`)
  if (T.applicant) console.log(`Confirmed applicant: ${T.applicant}`)
  console.log('')

  if (T.companyNumber) {
    console.log(`Pulling confirmed company ${T.companyNumber} directly (no keyword search).\n`)
    await analyseCompany(T.companyNumber)
  } else {
    await analyseBySearch()
  }
}

main().catch((err) => {
  console.error('\nTask 0 could not complete:\n  ' + (err as Error).message)
  console.error('\nNo lead-time number is printed because none was measured. (Not fabricated.)')
  process.exit(1)
})
