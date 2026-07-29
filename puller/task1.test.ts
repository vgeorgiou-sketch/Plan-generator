/*
  Run: node --experimental-strip-types puller/task1.test.ts
  Proves Task 1's pure logic against the NEW EPC API contract, offline:
  URL building, tolerant row/field extraction, address targeting, and the
  convergence flip.
*/

import { buildEpcUrl, epcSignalForBuilding, extractRows, isLargeCommercial, readField, rowAddress, rowFloorArea, type EpcRow } from './epc.ts'
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

console.log('new API URL contract')
{
  const u = new URL(buildEpcUrl({ address: '38-48 Southwark Bridge Road', size: 5 }))
  assert('host is the new service', u.host === 'get-energy-performance-data.communities.gov.uk', u.host)
  assert('path has NO /v1/', u.pathname === '/api/non-domestic/search', u.pathname)
  assert('address param URL-encoded', u.searchParams.get('address') === '38-48 Southwark Bridge Road')

  const c = new URL(buildEpcUrl({ councils: ['Southwark'], efficiencyRatings: ['E', 'F'] }))
  assert('council uses council[] with the NAME', c.searchParams.getAll('council[]').join() === 'Southwark', c.search)
  assert('efficiency_rating[] repeats per band', c.searchParams.getAll('efficiency_rating[]').join() === 'E,F')
  assert('old local-authority param is gone', c.searchParams.get('local-authority') === null)
}

console.log('\ntolerant response extraction (shape unconfirmed)')
{
  const row = { address: 'X', postcode: 'SE1 9BB' }
  assert('bare array', extractRows([row]).length === 1)
  assert('{rows:[…]}', extractRows({ rows: [row] }).length === 1)
  assert('{data:[…]}', extractRows({ data: [row] }).length === 1)
  assert('{results:[…]}', extractRows({ results: [row] }).length === 1)
  assert('nested {data:{rows:[…]}}', extractRows({ data: { rows: [row] } }).length === 1)
  assert('unknown shape → empty, not a crash', extractRows({ nope: 1 }).length === 0)

  assert('reads hyphenated field', readField({ 'total-floor-area': '9200' }, 'total-floor-area') === '9200')
  assert('reads snake_case equivalent', readField({ total_floor_area: '9200' }, 'total-floor-area') === '9200')
  assert('reads camelCase equivalent', readField({ totalFloorArea: '9200' }, 'total-floor-area') === '9200')
  assert('missing field → undefined', readField({}, 'total-floor-area') === undefined)
}

const matchingRow: EpcRow = {
  'lmk-key': 'seed-lmk',
  'building-reference-number': '9000000001',
  address: '38-48 Southwark Bridge Road',
  postcode: 'SE1 9BB',
  'property-type': 'B1 Office',
  'asset-rating-band': 'D',
  'total-floor-area': '9200',
  'lodgement-date': '2021-05-01',
}
const unrelatedRow: EpcRow = { address: '200 Blackfriars Road', postcode: 'SE1 8NW', 'total-floor-area': '5000' }

console.log('\naddress targeting')
{
  assert('rowAddress joins address + postcode', rowAddress(matchingRow) === '38-48 Southwark Bridge Road SE1 9BB')
  assert('rowFloorArea parses to a number', rowFloorArea(matchingRow) === 9200)
  assert('large office passes the size filter', isLargeCommercial(matchingRow))
  assert('small building fails', !isLargeCommercial({ ...matchingRow, 'total-floor-area': '400' }))

  const hit = findEpcForAddress([unrelatedRow, matchingRow], `${SEED.address} ${SEED.postcode}`)
  assert('finds the seed building', hit?.row['building-reference-number'] === '9000000001', hit)
  assert('no match when absent', findEpcForAddress([unrelatedRow], `${SEED.address} ${SEED.postcode}`) === null)
}

console.log('\npressure signal + convergence flip')
{
  const epc = epcSignalForBuilding(matchingRow, SEED.id)
  assert('filed epc pressure fact', epc.layer === 'epc' && epc.factType === 'filed' && epc.confidence === 1)
  assert('attached to the seed building', epc.buildingId === SEED.id)
  assert('label carries the band', epc.label === 'EPC rating: D', epc.label)
  assert('certificate URL on the new host', epc.sourceUrl.includes('get-energy-performance-data.communities.gov.uk'), epc.sourceUrl)

  const flip = flipWithEpc(epc)
  assert('seed starts NOT converged (kinetic-only)', flip.before === false)
  assert('adding EPC pressure flips it to CONVERGED', flip.after === true, flip)
}

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURES'}`)
process.exit(failures === 0 ? 0 : 1)
