/*
  Task 1 — EPC pressure layer, targeted at the confirmed seed building.
  Run: node --env-file=.env --experimental-strip-types puller/task1.ts

  Searches the NEW EPC service by ADDRESS for 38–48 Southwark Bridge Road
  (precise for this validation), falling back to a Southwark council sweep if
  the address query returns nothing. Then:
   - found → prints the EPC pressure signal and the seed flipping
     "not converged" → CONVERGED.
   - not found → reports it and recommends the VOA fallback (per the brief;
     VOA bulk-access terms must be confirmed at voa.gov.uk — not scraped blind).

  Fails loudly without credentials/egress; prints nothing fabricated.
*/

import {
  epcByAddress,
  epcByCouncil,
  epcSignalForBuilding,
  isLargeCommercial,
  rowAddress,
  rowFloorArea,
  type EpcRow,
} from './epc.ts'
import { matchAddress } from './addressMatch.ts'
import { convergenceOf } from '../signal-model/convergence.ts'
import { SBR_PRESS_BASELINE, SOUTHWARK_BRIDGE_ROAD_SEED as SEED } from '../signal-model/seed.ts'
import type { Signal } from '../signal-model/types.ts'

const ADDRESS_QUERY = '38-48 Southwark Bridge Road'
const TARGET = `${SEED.address} ${SEED.postcode}`
const MATCH_THRESHOLD = 0.7

/** Best EPC row for the target address among the pulled rows. */
export function findEpcForAddress(rows: EpcRow[], target: string): { row: EpcRow; score: number } | null {
  let best: { row: EpcRow; score: number } | null = null
  for (const row of rows) {
    const addr = rowAddress(row)
    if (!addr) continue
    const { score } = matchAddress(target, addr)
    if (score >= MATCH_THRESHOLD && (!best || score > best.score)) best = { row, score }
  }
  return best
}

/** What the seed's convergence becomes once an EPC pressure signal is added. */
export function flipWithEpc(epc: Signal): { before: boolean; after: boolean } {
  const before = convergenceOf(SEED, SBR_PRESS_BASELINE).isConverged
  const withEpc = { ...SEED, signals: [...SEED.signals, epc] }
  const after = convergenceOf(withEpc, SBR_PRESS_BASELINE).isConverged
  return { before, after }
}

async function main() {
  console.log(`Task 1 — EPC pressure layer for ${SEED.address}\n`)

  // 1. Precise: search the new API by address.
  console.log(`  → GET /api/non-domestic/search?address=${encodeURIComponent(ADDRESS_QUERY)}`)
  let rows = await epcByAddress(ADDRESS_QUERY)
  console.log(`    ${rows.length} rows returned`)

  let hit = findEpcForAddress(rows, TARGET)

  // 2. Fallback: sweep the council by name and match within it.
  if (!hit) {
    console.log('\n  address query gave no confident match — sweeping council[]=Southwark')
    rows = await epcByCouncil('Southwark')
    const large = rows.filter((r) => isLargeCommercial(r))
    console.log(`    ${rows.length} rows, ${large.length} ≥1,000 m² non-domestic`)
    hit = findEpcForAddress(large.length ? large : rows, TARGET)
  }

  if (!hit) {
    console.log(`\n✗ ${SEED.address} not found in EPC data.`)
    console.log(
      '\nVOA fallback (per the brief): pull the VOA business-rates entry for this address instead.\n' +
        'Confirm VOA bulk-access terms/format at voa.gov.uk first — do not scrape blind.\n' +
        'Until a pressure signal lands, the seed card stays honestly "not converged".',
    )
    return
  }

  const epc = epcSignalForBuilding(hit.row, SEED.id)
  const { before, after } = flipWithEpc(epc)
  console.log(`\n✓ EPC record found (address match ${hit.score.toFixed(2)}):`)
  console.log(`    ${epc.label} · lodged ${epc.observedAt} · ${rowFloorArea(hit.row) ?? '?'} m²`)
  console.log(`    address: ${rowAddress(hit.row)}`)
  console.log(`    source:  ${epc.sourceUrl}`)
  console.log('\n  Raw row (so field names can be pinned to the real API shape):')
  console.log(JSON.stringify(hit.row, null, 2))
  console.log('\n  Pressure-layer signal to add to the seed (paste this back to wire it in):')
  console.log(JSON.stringify(epc, null, 2))
  console.log(`\n  Convergence: ${before ? 'converged' : 'not converged'} → ${after ? 'CONVERGED ✓' : 'still not converged'}`)
}

main().catch((err) => {
  console.error('\nTask 1 could not complete:\n  ' + (err as Error).message)
  console.error('\nNo EPC record is reported because none was pulled. (Not fabricated.)')
  process.exit(1)
})
