/*
  The full spike, Tasks 1→5. Run where egress + keys exist:

    export CH_API_KEY=…            # https://developer.company-information.service.gov.uk/
    export EPC_EMAIL=…  EPC_API_KEY=…   # https://epc.opendatacommunities.org/
    node --experimental-strip-types puller/run.ts

  Deliverable: a plain list of CONVERGED Southwark buildings (a pressure layer
  confirmed by a kinetic layer) with their evidence — plus the Task 0 lead-time
  number. Not a dashboard. Fails loudly and prints nothing fabricated if a
  source is unreachable.
*/

import { epcSearch, isLargeCommercial, normaliseEpcRow } from './epc.ts'
import { scanNewSpvs, SOUTHWARK_DISTRICTS } from './spvScan.ts'
import { fetchWeeklyListHtml, parseWeeklyList, demolitionRows, demolitionToHit } from './southwarkDemolition.ts'
import { assemble, convergedOnly, type KineticHit, type UniverseRecord } from './crossReference.ts'
import { scoreBandLine } from './report.ts'

async function main() {
  const asOf = new Date().toISOString().slice(0, 10)
  console.log(`Southwark convergence spike · ${asOf}\n`)

  // Task 1 — pressure universe (EPC).
  const universe: UniverseRecord[] = []
  for (const district of SOUTHWARK_DISTRICTS) {
    const rows = await epcSearch(district)
    for (const row of rows) {
      if (!isLargeCommercial(row)) continue
      const rec = normaliseEpcRow(row, 'Southwark')
      if (rec) universe.push(rec)
    }
    console.log(`  EPC ${district}: ${rows.length} certs → running universe ${universe.length}`)
  }
  if (universe.length === 0) {
    console.log('\nEmpty universe — no large commercial EPCs found. Check the query/filters.')
    return
  }

  // Tasks 2 & 4 — kinetic hits.
  const kinetic: KineticHit[] = []
  const spvs = await scanNewSpvs({ location: 'southwark', monthsBack: 12 })
  kinetic.push(...spvs)
  console.log(`  New SPVs (Task 2): ${spvs.length}`)

  const html = await fetchWeeklyListHtml()
  const demos = demolitionRows(parseWeeklyList(html))
  for (const d of demos) kinetic.push(demolitionToHit(d, asOf))
  console.log(`  Demolition notices (Task 4): ${demos.length}`)

  // Task 5 — cross-reference + convergence.
  const { buildings, unmatchedHits } = assemble(universe, kinetic, asOf)
  const converged = convergedOnly(buildings)

  console.log('\n' + '═'.repeat(64))
  console.log(`CONVERGED BUILDINGS: ${converged.length} of ${universe.length} in the universe`)
  console.log(`(${unmatchedHits.length} kinetic hits matched no building — untargeted, held back)\n`)

  for (const b of converged) {
    const c = b.convergence
    console.log(`▸ ${b.opportunity.address}, ${b.opportunity.postcode}`)
    console.log(`    ${scoreBandLine(c)}`)
    for (const s of b.opportunity.signals) {
      const flag = s.factType === 'filed' ? '●' : s.factType === 'derived' ? '◐' : '○'
      console.log(`    ${flag} [${s.layer}] ${s.label}  (${s.observedAt}, conf ${s.confidence})  ${s.sourceUrl}`)
    }
    console.log('')
  }

  if (converged.length === 0) {
    console.log('No converged buildings this run. A valid kill — or the window/filters need widening.')
  }
}

main().catch((err) => {
  console.error('\nSpike could not complete:\n  ' + (err as Error).message)
  console.error('\nNo results printed because none were measured. (Not fabricated.)')
  process.exit(1)
})
