/*
  Run: node --experimental-strip-types puller/sweepEnrich.test.ts
  Proves runEnrichmentPass's resume/skip/error-handling behaviour with a
  fake planning check — no network, no real delay. This is the logic that
  makes "kill the script, re-run it" safe: already-checked records are
  never touched again, every candidate gets a save callback, and a failure
  on one candidate never stops the rest.
*/

import { runEnrichmentPass } from './sweepEnrich.ts'
import type { SweepRecord } from './sweep.ts'
import type { PlanningCheckResult } from './planning.ts'
import type { EnrichedCandidate } from './sweep.ts'

let failures = 0
function assert(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ok   ${name}`)
  else {
    failures++
    console.log(`  FAIL ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`)
  }
}

function mkEnriched(number: string, name: string): EnrichedCandidate {
  return {
    hit: { company_name: name, company_number: number, date_of_creation: '2026-01-01' },
    profile: { company_number: number, company_name: name },
    psc: [],
    charges: [],
    officers: [],
    filings: [],
  }
}

const NO_DELAY = () => 0
const CHECKED_RESULT: PlanningCheckResult = { checked: true, variantsUsed: ['simple search (form → POST)'], matches: [] }

console.log('runEnrichmentPass — only PENDING records are processed (planning === undefined is the resume marker)')
{
  const alreadyDone: SweepRecord = { enriched: mkEnriched('30000001', 'Already Done Ltd'), address: '1 Done St', planning: { checked: true, variantsUsed: [], matches: [] } }
  const pending: SweepRecord = { enriched: mkEnriched('30000002', 'Pending Ltd'), address: '2 Pending St' }
  const records = [alreadyDone, pending]

  let calls = 0
  const checkedThisRun = await runEnrichmentPass(records, {
    checkPlanning: async () => {
      calls++
      return CHECKED_RESULT
    },
    delayMs: NO_DELAY,
    log: () => {},
  })

  assert('the already-done record is never re-checked', calls === 1, calls)
  assert('checkedThisRun counts only the newly-processed record', checkedThisRun === 1, checkedThisRun)
  assert('the pending record now has a planning result', pending.planning !== undefined)
  assert("the already-done record's planning result is untouched (same object)", records[0].planning === alreadyDone.planning)
}

console.log('\nrunEnrichmentPass — a record with no address is marked processed without ever calling the planning check')
{
  const noAddress: SweepRecord = { enriched: mkEnriched('30000003', 'No Address Ltd') }
  let calls = 0
  await runEnrichmentPass([noAddress], { checkPlanning: async () => { calls++; return CHECKED_RESULT }, delayMs: NO_DELAY, log: () => {} })

  assert('the planning check is never called for a candidate with no address', calls === 0, calls)
  assert('it still gets a planning result (checked: false), so it is never retried forever', noAddress.planning?.checked === false, noAddress.planning)
  assert('the reason names the actual cause — no address, not a vague failure', Boolean(noAddress.planning?.error?.includes('no address')), noAddress.planning?.error)
}

console.log("\nrunEnrichmentPass — one candidate's check throwing never stops the rest, and is never silently missing")
{
  const willThrow: SweepRecord = { enriched: mkEnriched('30000004', 'Throws Ltd'), address: '4 Throws St' }
  const willSucceed: SweepRecord = { enriched: mkEnriched('30000005', 'Succeeds Ltd'), address: '5 Succeeds St' }
  const records = [willThrow, willSucceed]

  await runEnrichmentPass(records, {
    checkPlanning: async (address: string) => {
      if (address === '4 Throws St') throw new Error('simulated: rate limited past all retries')
      return CHECKED_RESULT
    },
    delayMs: NO_DELAY,
    log: () => {},
  })

  assert('the throwing candidate still gets a planning result (checked: false), not left undefined', willThrow.planning?.checked === false, willThrow.planning)
  assert('the thrown error message is captured, not swallowed', Boolean(willThrow.planning?.error?.includes('rate limited past all retries')), willThrow.planning?.error)
  assert('the NEXT candidate still gets checked — one failure never stops the pass', willSucceed.planning?.checked === true, willSucceed.planning)
}

console.log('\nrunEnrichmentPass — every candidate triggers a save callback (this is what makes kill-and-resume safe)')
{
  const a: SweepRecord = { enriched: mkEnriched('30000006', 'A Ltd'), address: '6 A St' }
  const b: SweepRecord = { enriched: mkEnriched('30000007', 'B Ltd'), address: '7 B St' }
  let saveCount = 0
  await runEnrichmentPass([a, b], { checkPlanning: async () => CHECKED_RESULT, delayMs: NO_DELAY, onRecordSaved: () => saveCount++, log: () => {} })

  assert('onRecordSaved fires once per candidate processed (2), not once for the whole batch', saveCount === 2, saveCount)
}

console.log('\nrunEnrichmentPass — paced with a real delay between candidates, never before the first')
{
  const a: SweepRecord = { enriched: mkEnriched('30000008', 'First Ltd'), address: '8 First St' }
  const b: SweepRecord = { enriched: mkEnriched('30000009', 'Second Ltd'), address: '9 Second St' }
  const delaysRequested: number[] = []
  await runEnrichmentPass([a, b], {
    checkPlanning: async () => CHECKED_RESULT,
    delayMs: () => {
      delaysRequested.push(1)
      return 0
    },
    log: () => {},
  })

  assert('delayMs is called exactly once — before the SECOND candidate, never before the first', delaysRequested.length === 1, delaysRequested.length)
}

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURES'}`)
process.exit(failures === 0 ? 0 : 1)
