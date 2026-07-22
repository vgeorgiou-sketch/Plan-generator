/*
  Run: node --experimental-strip-types puller/leadTime.test.ts
  Proves the Task 0 pure logic against a realistic Companies House
  filing-history fixture — no network required.
*/

import { isLLPNumber, isOwnershipChange, leadTimeDays, summariseLeadTime, type ChFiling } from './leadTime.ts'

let failures = 0
function assert(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ok   ${name}`)
  else {
    failures++
    console.log(`  FAIL ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`)
  }
}

// Realistic shape of GET /company/{n}/filing-history items.
const fixture: ChFiling[] = [
  { transaction_id: 't1', category: 'incorporation', type: 'NEWINC', date: '2019-03-11', description: 'incorporation-company' },
  { transaction_id: 't2', category: 'confirmation-statement', type: 'CS01', date: '2024-03-20', description: 'confirmation-statement' },
  { transaction_id: 't3', category: 'persons-with-significant-control', type: 'PSC01', date: '2025-11-04', description: 'psc-individual-appointment' },
  { transaction_id: 't4', category: 'mortgage', type: 'MR01', date: '2025-11-28', description: 'create-a-registered-charge' },
  { transaction_id: 't5', category: 'accounts', type: 'AA', date: '2026-01-10', description: 'accounts' },
  { transaction_id: 't6', category: 'change-of-name', type: 'NM01', date: '2026-02-02', description: 'change-of-name' },
]

console.log('ownership-change classification')
assert('PSC change is an ownership change', isOwnershipChange(fixture[2]))
assert('new charge (mortgage) is an ownership change', isOwnershipChange(fixture[3]))
assert('change of name is an ownership change', isOwnershipChange(fixture[5]))
assert('confirmation statement is NOT an ownership change', !isOwnershipChange(fixture[1]))
assert('accounts filing is NOT an ownership change', !isOwnershipChange(fixture[4]))

console.log('\nlead-time maths')
assert('exact day diff', leadTimeDays('2026-03-01', '2026-06-01') === 92, leadTimeDays('2026-03-01', '2026-06-01'))
assert('month-granularity dates parse (YYYY-MM → 1st)', leadTimeDays('2026-04', '2026-06-01') === 61, leadTimeDays('2026-04', '2026-06-01'))

console.log('\nsummariseLeadTime against June 2026 press baseline')
{
  const r = summariseLeadTime(fixture, '2026-06-01')
  // Earliest ownership-change filing within 730 days before press = PSC change 2025-11-04.
  // (The 2019 incorporation is outside the 2-year window.)
  assert('driving filing is the 2025-11-04 PSC change', r.drivingFiling?.date === '2025-11-04', r.drivingFiling)
  assert('lead time = 209 days before the press report', r.leadTimeDays === 209, r.leadTimeDays)
  assert('all four ownership-change filings surfaced as candidates', r.candidates.length === 4, r.candidates.map((c) => c.date))
  assert('candidates are oldest-first', r.candidates[0].date === '2019-03-11')
}

console.log('\nwindow + edge cases')
{
  const none = summariseLeadTime(
    [{ category: 'accounts', date: '2026-01-01' }, { category: 'confirmation-statement', date: '2026-02-01' }],
    '2026-06-01',
  )
  assert('no ownership-change filings → null lead time', none.drivingFiling === null && none.leadTimeDays === null)
}
{
  // A filing after the press date must not count toward the headline.
  const future = summariseLeadTime([{ category: 'mortgage', date: '2026-07-01' }], '2026-06-01')
  assert('filing after press date is not the driver', future.drivingFiling === null, future)
  assert('but is still returned as a candidate', future.candidates.length === 1)
}

console.log('\nconfirmed case: Southwark Bridge Road LLP (OC455308)')
{
  // The vehicle's own incorporation is necessarily its earliest possible filing,
  // so for a fresh acquisition LLP the incorporation is the driving event.
  assert('incorporation 2025-01-28 → press 2026-06-01 = 489 days', leadTimeDays('2025-01-28', '2026-06-01') === 489, leadTimeDays('2025-01-28', '2026-06-01'))

  const llp: ChFiling[] = [
    { category: 'incorporation', type: 'LLIN01', date: '2025-01-28', description: 'incorporation' },
    { category: 'persons-with-significant-control', type: 'PSC01', date: '2025-02-10' },
  ]
  const r = summariseLeadTime(llp, '2026-06-01', 730, { isLLP: true })
  assert('driving filing is the incorporation (2025-01-28)', r.drivingFiling?.date === '2025-01-28', r.drivingFiling)
  assert('headline lead time = 489 days (not the 714 keyword false positive)', r.leadTimeDays === 489, r.leadTimeDays)
}

console.log('\nLLP awareness (Southwark Bridge Road LLP is a partnership)')
{
  assert('OC number is an LLP', isLLPNumber('OC423456'))
  assert('SO number is an LLP (Scotland)', isLLPNumber('SO301234'))
  assert('plain numeric is NOT an LLP', !isLLPNumber('06407775'))

  const memberChange: ChFiling = { category: 'officers', type: 'LLAP01', date: '2024-06-17', description: 'appointment-of-a-member' }
  assert('member change counts as ownership change FOR an LLP', isOwnershipChange(memberChange, { isLLP: true }))
  assert('officers change does NOT count for a Ltd (director ≠ owner)', !isOwnershipChange(memberChange, { isLLP: false }))

  // An LLP whose earliest in-window ownership event is a member change.
  const llpFilings: ChFiling[] = [
    { category: 'incorporation', date: '2008-01-01' }, // outside window
    { category: 'officers', date: '2024-06-17', description: 'appointment-of-a-member' },
    { category: 'persons-with-significant-control', date: '2025-02-01' },
  ]
  const asLlp = summariseLeadTime(llpFilings, '2026-06-01', 730, { isLLP: true })
  assert('LLP: driving filing is the 2024-06-17 member change', asLlp.drivingFiling?.date === '2024-06-17', asLlp.drivingFiling)
  assert('LLP: lead time = 714 days', asLlp.leadTimeDays === 714, asLlp.leadTimeDays)

  const asLtd = summariseLeadTime(llpFilings, '2026-06-01', 730, { isLLP: false })
  assert('same filings as a Ltd: member change ignored, PSC drives it (2025-02-01)', asLtd.drivingFiling?.date === '2025-02-01', asLtd.drivingFiling)
}

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURES'}`)
process.exit(failures === 0 ? 0 : 1)
