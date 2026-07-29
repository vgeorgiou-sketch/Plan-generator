/*
  Task 1 — EPC pressure layer, targeted at the confirmed seed building.
  Run: node --env-file=.env --experimental-strip-types puller/task1.ts

  Pulls Southwark non-domestic EPCs (floor area ≥ 1,000 m²), looks for
  38–48 Southwark Bridge Road, and:
   - if found → prints the EPC pressure signal and shows the seed flip from
     "not converged" to "converged" (pressure × kinetic).
   - if NOT found → reports it and recommends the VOA fallback (per the brief;
     VOA bulk-access terms must be confirmed at voa.gov.uk before wiring — not
     scraped blind here).

  Needs EPC_EMAIL + EPC_API_KEY and network egress; fails loudly otherwise and
  prints nothing fabricated.
*/

import { epcByLocalAuthority, epcSignalForBuilding, isLargeCommercial, SOUTHWARK_ONS, type EpcRow } from './epc.ts'
import { matchAddress } from './addressMatch.ts'
import { convergenceOf } from '../signal-model/convergence.ts'
import { SBR_PRESS_BASELINE, SOUTHWARK_BRIDGE_ROAD_SEED as SEED } from '../signal-model/seed.ts'
import type { Signal } from '../signal-model/types.ts'

const TARGET = `${SEED.address} ${SEED.postcode}`
const MATCH_THRESHOLD = 0.7

/** Best EPC row for the target address among the pulled rows. */
export function findEpcForAddress(
  rows: EpcRow[],
  target: string,
): { row: EpcRow; score: number } | null {
  let best: { row: EpcRow; score: number } | null = null
  for (const row of rows) {
    const addr = `${row.address ?? ''} ${row.postcode ?? ''}`.trim()
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

  // Sweep the whole borough by ONS local-authority code. (A bare district like
  // "SE1" is NOT a valid `postcode` value and makes EPC serve its HTML page.)
  const rows = await epcByLocalAuthority(SOUTHWARK_ONS, 5000)
  const universe: EpcRow[] = rows.filter((r) => isLargeCommercial(r))
  console.log(`  EPC Southwark (${SOUTHWARK_ONS}): ${rows.length} certs, ${universe.length} ≥1,000 m² non-domestic\n`)

  const hit = findEpcForAddress(universe, TARGET)
  if (!hit) {
    console.log(`✗ ${SEED.address} not found in Southwark EPC data.`)
    console.log(
      '\nVOA fallback (per the brief): pull the VOA business-rates entry for this address instead.\n' +
        'VOA bulk-access terms/format must be confirmed at voa.gov.uk first — do not scrape blind.\n' +
        'Until a pressure signal lands, the seed card stays honestly "not converged".',
    )
    return
  }

  const epc = epcSignalForBuilding(hit.row, SEED.id)
  const { before, after } = flipWithEpc(epc)
  console.log(`✓ EPC record found (address match ${hit.score.toFixed(2)}):`)
  console.log(`    ${epc.label} · lodged ${epc.observedAt} · ${hit.row['total-floor-area'] ?? '?'} m²`)
  console.log(`    source: ${epc.sourceUrl}\n`)
  console.log('  Pressure-layer signal to add to the seed (paste this back for me to wire in):')
  console.log(JSON.stringify(epc, null, 2))
  console.log(`\n  Convergence: ${before ? 'converged' : 'not converged'} → ${after ? 'CONVERGED ✓' : 'still not converged'}`)
}

main().catch((err) => {
  console.error('\nTask 1 could not complete:\n  ' + (err as Error).message)
  console.error('\nNo EPC record is reported because none was pulled. (Not fabricated.)')
  process.exit(1)
})
