/*
  Run: node --experimental-strip-types puller/companiesHouse.test.ts
  Proves the two CH search endpoints normalise into a CompanyHit with the
  name always populated — the fix for company names showing as "undefined".
*/

import {
  findControllers,
  fromAdvancedItem,
  fromSearchItem,
  nameContains,
  namesMatch,
  pickCompanyName,
  NAME_UNAVAILABLE,
} from './companiesHouse.ts'
import { spvToHit } from './kineticSignals.ts'

let failures = 0
function assert(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ok   ${name}`)
  else {
    failures++
    console.log(`  FAIL ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`)
  }
}

// Real /search/companies item shape: name is in `title`, not `company_name`.
console.log('/search/companies mapping (this was the bug)')
{
  const raw = {
    title: 'SBR PROPCO LIMITED',
    company_number: '15123456',
    date_of_creation: '2025-10-01',
    address_snippet: '38-48 Southwark Bridge Road, London, SE1 9BB',
    address: { premises: '38-48', address_line_1: 'Southwark Bridge Road', locality: 'London', postal_code: 'SE1 9BB' },
  }
  const hit = fromSearchItem(raw)
  assert('title → company_name (no longer undefined)', hit.company_name === 'SBR PROPCO LIMITED', hit.company_name)
  assert('company_number carried through', hit.company_number === '15123456')
  assert('date_of_creation carried through', hit.date_of_creation === '2025-10-01')
  assert('address_snippet preserved', hit.address_snippet?.includes('Southwark Bridge Road') === true)
  assert('structured address preserved', hit.registered_office_address?.postal_code === 'SE1 9BB')
}

// Real /advanced-search/companies item shape: name is in `company_name`.
console.log('\n/advanced-search/companies mapping')
{
  const raw = {
    company_name: 'HUB SBR DEVELOPMENTS LTD',
    company_number: '15987654',
    date_of_creation: '2025-06-15',
    registered_office_address: { address_line_1: '10 Bridge Street', postal_code: 'SE1 9BB' },
  }
  const hit = fromAdvancedItem(raw)
  assert('company_name carried through', hit.company_name === 'HUB SBR DEVELOPMENTS LTD')
  assert('registered_office_address preserved', hit.registered_office_address?.postal_code === 'SE1 9BB')
}

console.log('\nmissing-name fallback (never prints literal "undefined")')
{
  assert('search item with no title → placeholder', fromSearchItem({ company_number: '1' }).company_name === '(name unavailable)')
  assert('advanced item with no name → placeholder', fromAdvancedItem({ company_number: '2' }).company_name === '(name unavailable)')
  assert('empty title → placeholder, not empty string', fromSearchItem({ title: '   ', company_number: '3' }).company_name === '(name unavailable)')
}

console.log('\ndownstream: SPV signal label now shows the entity')
{
  const hit = fromSearchItem({ title: 'SBR PROPCO LIMITED', company_number: '15123456', address_snippet: '38-48 Southwark Bridge Road SE1 9BB' })
  const kinetic = spvToHit(hit)
  assert('SPV signal label names the company', kinetic.signal.label === 'New SPV: SBR PROPCO LIMITED', kinetic.signal.label)
  assert('SPV hit address falls back to snippet when structured is absent', kinetic.address.includes('Southwark Bridge Road'), kinetic.address)
}

console.log('\npickCompanyName — authoritative name resolution (task0)')
{
  assert('prefers the first real name', pickCompanyName('SBR PROPCO LIMITED', 'other') === 'SBR PROPCO LIMITED')
  assert('skips undefined, uses the profile name', pickCompanyName(undefined, 'HUB SBR DEVELOPMENTS LTD') === 'HUB SBR DEVELOPMENTS LTD')
  assert('skips the placeholder in favour of a real later name', pickCompanyName(NAME_UNAVAILABLE, 'Real Co Ltd') === 'Real Co Ltd')
  assert('skips blank/whitespace', pickCompanyName('   ', 'Real Co Ltd') === 'Real Co Ltd')
  assert('all missing → placeholder, never the literal "undefined"', pickCompanyName(undefined, undefined, '') === NAME_UNAVAILABLE)
}

console.log('\nnamesMatch — exact applicant matching (Task 0 headline)')
{
  assert('same name, different case/spacing matches', namesMatch('Southwark Bridge Road LLP', 'SOUTHWARK BRIDGE ROAD  LLP'))
  assert('punctuation ignored', namesMatch('Southwark Bridge Road LLP', 'Southwark Bridge Road, LLP'))
  assert('different entity suffix does NOT match (LLP ≠ LTD)', !namesMatch('Southwark Bridge Road LLP', 'Southwark Bridge Road Ltd'))
  assert('different name does not match', !namesMatch('Southwark Bridge Road LLP', 'HUB SBR Developments Ltd'))
  assert('undefined never matches', !namesMatch(undefined, 'Southwark Bridge Road LLP'))
}

console.log('\nPSC controller matching (HUB / Bridges Fund Management)')
{
  assert('"HUB" matches as a whole token in "HUB SBR LIMITED"', nameContains('HUB SBR LIMITED', 'HUB'))
  assert('"HUB" does NOT match inside "HUBBARD LTD"', !nameContains('HUBBARD LTD', 'HUB'))
  assert('multi-word "Bridges Fund Management" matches contiguously', nameContains('BRIDGES FUND MANAGEMENT LIMITED', 'Bridges Fund Management'))
  assert('non-contiguous tokens do not match', !nameContains('BRIDGES OF LONDON MANAGEMENT LTD', 'Bridges Fund Management'))

  const pscNames = ['HUB SBR (GP) LIMITED', 'BRIDGES FUND MANAGEMENT LIMITED', 'A N Other']
  const matches = findControllers(pscNames, ['HUB', 'Bridges Fund Management'])
  assert('HUB flagged as named', matches[0].named && matches[0].matchedBy[0] === 'HUB SBR (GP) LIMITED', matches[0])
  assert('Bridges Fund Management flagged as named', matches[1].named && matches[1].matchedBy[0].includes('BRIDGES FUND MANAGEMENT'), matches[1])

  const noneNamed = findControllers(['SOME NOMINEE LTD'], ['HUB', 'Bridges Fund Management'])
  assert('neither named when absent', !noneNamed[0].named && !noneNamed[1].named)
}

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURES'}`)
process.exit(failures === 0 ? 0 : 1)
