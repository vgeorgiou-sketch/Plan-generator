/*
  Run: node --experimental-strip-types puller/task1.test.ts
  Proves Task 1's pure logic offline: an EPC row matching the seed address
  becomes a pressure signal that flips the seed to converged; a non-matching
  universe leaves it honestly not-converged (→ VOA fallback).
*/

import { epcSignalForBuilding, type EpcRow } from './epc.ts'
import { findEpcForAddress, flipWithEpc } from './task1.ts'
import { SOUTHWARK_BRIDGE_ROAD_SEED as SEED } from '../signal-model/seed.ts'

let failures = 0
function assert(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ok   ${name}`)
  else {
    failures++
    console.log(`  FAIL ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`)
  }
}

const matchingRow: EpcRow = {
  'lmk-key': 'seed-lmk',
  'building-reference-number': '9000000001',
  address: '38-48 Southwark Bridge Road',
  postcode: 'SE1 9BB', // real EPC rows carry the full postcode; the seed only has district "SE1"
  'property-type': 'B1 Office',
  'asset-rating': '78',
  'asset-rating-band': 'D',
  'total-floor-area': '9200',
  'lodgement-date': '2021-05-01',
}
const unrelatedRow: EpcRow = { address: '200 Blackfriars Road', postcode: 'SE1 8NW', 'total-floor-area': '5000', 'asset-rating-band': 'C' }

console.log('address targeting')
{
  const hit = findEpcForAddress([unrelatedRow, matchingRow], `${SEED.address} ${SEED.postcode}`)
  assert('finds the matching EPC row for the seed address', hit?.row['building-reference-number'] === '9000000001', hit)
  const miss = findEpcForAddress([unrelatedRow], `${SEED.address} ${SEED.postcode}`)
  assert('returns null when the address is not in the universe', miss === null)
}

console.log('\npressure signal + convergence flip')
{
  const epc = epcSignalForBuilding(matchingRow, SEED.id)
  assert('signal is a filed epc pressure fact', epc.layer === 'epc' && epc.factType === 'filed' && epc.confidence === 1)
  assert('signal is attached to the seed building', epc.buildingId === SEED.id)
  assert('EPC cert URL built from lmk-key', epc.sourceUrl.includes('seed-lmk'))

  const flip = flipWithEpc(epc)
  assert('seed starts NOT converged (kinetic-only)', flip.before === false)
  assert('adding EPC pressure flips it to CONVERGED', flip.after === true, flip)
}

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURES'}`)
process.exit(failures === 0 ? 0 : 1)
