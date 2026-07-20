/*
  Task 0 — Southwark Bridge Road validation, end to end.
  Run: CH_API_KEY=… node --experimental-strip-types puller/task0.ts

  Prints the headline plainly: "the public record showed this N days before
  the trade press did." If the network or key is unavailable it fails LOUDLY
  and prints nothing that could be mistaken for a real result — a fabricated
  lead time is worse than no answer.
*/

import { filingHistory, searchCompanies } from './companiesHouse.ts'
import { summariseLeadTime } from './leadTime.ts'
import { SOUTHWARK_BRIDGE_ROAD as T } from '../signal-model/targets.ts'

async function main() {
  console.log(`Task 0 — ${T.address}, ${T.borough}`)
  console.log(`Claim: ${T.claim}\n`)

  // Step 1 — find candidate owning companies.
  const seen = new Map<string, string>() // number → name
  for (const term of T.companiesHouseSearch) {
    const hits = await searchCompanies(term)
    for (const h of hits) seen.set(h.company_number, h.company_name)
    console.log(`  search "${term}" → ${hits.length} companies`)
  }
  if (seen.size === 0) {
    console.log('\nNo candidate companies found. Refine the search terms — this may be a valid partial kill.')
    return
  }

  // Steps 2–3 — pull filing history and find the ownership-change filings.
  let best: { company: string; number: string; leadTimeDays: number; filingDate: string } | null = null
  for (const [number, name] of seen) {
    const filings = await filingHistory(number)
    const summary = summariseLeadTime(filings, T.pressBaseline)
    if (summary.drivingFiling && summary.leadTimeDays !== null) {
      console.log(
        `  ${name} (${number}): ownership-change filing ${summary.drivingFiling.date} ` +
          `(${summary.drivingFiling.category}) → ${summary.leadTimeDays} days before press`,
      )
      if (!best || summary.leadTimeDays > best.leadTimeDays) {
        best = { company: name, number, leadTimeDays: summary.leadTimeDays, filingDate: summary.drivingFiling.date }
      }
    }
  }

  // Step 4 — the headline.
  console.log('\n' + '─'.repeat(60))
  if (best) {
    console.log(
      `HEADLINE: the public record showed this ${best.leadTimeDays} days before the trade press.\n` +
        `  Driving filing: ${best.filingDate} · ${best.company} (${best.number})\n` +
        `  Press baseline: ${T.pressBaseline} (Building magazine, June 2026)`,
    )
  } else {
    console.log(
      'No ownership-change filing found in-window across the candidate companies.\n' +
        'That is a valid kill — either the change was not filed the way we expected, or our company match is wrong.',
    )
  }
}

main().catch((err) => {
  console.error('\nTask 0 could not complete:\n  ' + (err as Error).message)
  console.error('\nNo lead-time number is printed because none was measured. (Not fabricated.)')
  process.exit(1)
})
