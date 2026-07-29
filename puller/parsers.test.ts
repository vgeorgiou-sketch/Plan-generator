/*
  Run: node --experimental-strip-types puller/parsers.test.ts
  Proves the Idox weekly-list parser, EPC normalisation, and CH mappers —
  all offline against fixtures.
*/

import { demolitionRows, demolitionToHit, parseWeeklyList } from './southwarkDemolition.ts'
import { isLargeCommercial, normaliseEpcRow, type EpcRow } from './epc.ts'
import { spvToHit, chargeToHit } from './kineticSignals.ts'

let failures = 0
function assert(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ok   ${name}`)
  else {
    failures++
    console.log(`  FAIL ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`)
  }
}

// Representative Idox Public Access weekly-list markup (structure verified
// against a standard install; must be re-checked against Southwark live HTML).
const IDOX_HTML = `
<ul id="searchresults">
  <li class="searchresult">
    <a href="/online-applications/applicationDetails.do?keyVal=ABC123">26/AP/0412 | Demolition of existing office building and redevelopment</a>
    <p class="address">38-48 Southwark Bridge Road, London, SE1 9BB</p>
  </li>
  <li class="searchresult">
    <a href="/online-applications/applicationDetails.do?keyVal=DEF456">26/AP/0511 | Erection of single storey rear extension</a>
    <p class="address">10 Blackfriars Road, London, SE1 8NW</p>
  </li>
</ul>`

console.log('Idox weekly-list parser')
{
  const rows = parseWeeklyList(IDOX_HTML)
  assert('parses 2 result rows', rows.length === 2, rows.length)
  assert('extracts reference 26/AP/0412', rows[0].reference === '26/AP/0412', rows[0].reference)
  assert('extracts address', rows[0].address.includes('Southwark Bridge Road'), rows[0].address)
  assert('resolves relative detail URL to absolute', rows[0].detailUrl.startsWith('https://planning.southwark.gov.uk/'), rows[0].detailUrl)

  const demos = demolitionRows(rows)
  assert('filters to the demolition row only', demos.length === 1 && demos[0].reference === '26/AP/0412', demos.map((d) => d.reference))

  const hit = demolitionToHit(demos[0], '2026-03-15')
  assert('demolition hit is a kinetic buildingControlDemolition signal', hit.signal.layer === 'buildingControlDemolition')
  assert('demolition hit carries the notice date', hit.signal.observedAt === '2026-03-15')
  assert('demolition hit carries the source URL', hit.signal.sourceUrl.includes('applicationDetails.do'))
}

console.log('\nEPC normalisation')
{
  const row: EpcRow = {
    'lmk-key': 'abc-lmk-key',
    'building-reference-number': '1234567890',
    address: '38-48 Southwark Bridge Road',
    postcode: 'SE1 9BB',
    'property-type': 'B1 Office',
    'asset-rating': '82',
    'asset-rating-band': 'D',
    'total-floor-area': '9200',
    'lodgement-date': '2021-05-01',
  }
  const rec = normaliseEpcRow(row, 'Southwark')!
  assert('produces a universe record', rec !== null && rec.postcode === 'SE1 9BB')
  assert('floor area parsed as number', rec.floorArea === 9200, rec.floorArea)
  assert('pressure signal is a filed epc signal', rec.pressureSignal.layer === 'epc' && rec.pressureSignal.factType === 'filed')
  assert('pressure signal buildingId wired to record id', rec.pressureSignal.buildingId === rec.id)
  assert('EPC cert URL built from lmk-key', rec.pressureSignal.sourceUrl.includes('abc-lmk-key'))
  assert('large office passes the size/type filter', isLargeCommercial(row) === true)

  const small: EpcRow = { ...row, 'total-floor-area': '400' }
  assert('small building fails the filter', isLargeCommercial(small) === false)
  assert('row without postcode is dropped', normaliseEpcRow({ ...row, postcode: undefined }, 'Southwark') === null)
}

console.log('\nCompanies House mappers')
{
  const spv = spvToHit({
    company_name: 'SBR PROPCO LIMITED',
    company_number: '15123456',
    date_of_creation: '2025-10-01',
    registered_office_address: { address_line_1: '38-48 Southwark Bridge Road', postal_code: 'SE1 9BB' },
  })
  assert('SPV hit is inferred (name→building match is uncertain)', spv.signal.factType === 'inferred')
  assert('SPV confidence capped at 0.5', spv.signal.confidence === 0.5)
  assert('SPV hit carries registered-office address', spv.address.includes('Southwark Bridge Road'))

  const charge = chargeToHit('15123456', '38-48 Southwark Bridge Road SE1 9BB', {
    status: 'outstanding',
    created_on: '2025-11-28',
    charge_code: '151234560001',
    classification: { description: 'A registered charge' },
  })
  assert('charge hit is filed', charge.signal.factType === 'filed' && charge.signal.confidence === 1)
  assert('charge hit is a kinetic charge signal', charge.signal.layer === 'companiesHouseCharge')
  assert('charge observedAt = created_on', charge.signal.observedAt === '2025-11-28')

  const satisfied = chargeToHit('15123456', 'addr', { status: 'fully-satisfied', created_on: '2024-01-01', satisfied_on: '2026-02-01' })
  assert('satisfied charge uses satisfied date + flags refinancing', satisfied.signal.observedAt === '2026-02-01' && /refinancing/i.test(satisfied.signal.note ?? ''))
}

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURES'}`)
process.exit(failures === 0 ? 0 : 1)
