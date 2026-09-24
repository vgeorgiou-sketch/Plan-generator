/*
  Part 1, stage 2 — enrichment: planning, ONE candidate at a time, from a
  file sweepDiscover.ts already wrote.

  This is the stage that failed twice when it lived inside one big loop
  (see sweep.ts's file header, and planning.ts's for the full diagnosis):
  firing ~20 planning checks back-to-back tripped Southwark's rate limit,
  and once THAT was paced out, a shared connection pool let cross-candidate
  session state bleed. checkPlanningForAddress already fixes both — a
  brand-new, isolated, --use-system-ca-trusted dispatcher per call, with
  429 retry/backoff built in — so this script's only remaining job is to
  call that ONE proven, per-address path (the exact same one planningCheck.ts
  uses successfully for a single address) slowly, one candidate at a time,
  with a real delay between them.

  Resumable by design: the results file is rewritten after EVERY candidate,
  and any record that already has a `planning` field is skipped on the next
  run. Kill this script at any point and re-run it with the same file — it
  picks up exactly where it left off, never re-checking (and never
  re-risking a rate limit on) a candidate that's already done. runEnrichmentPass
  below is the resumable-processing logic, factored out so sweepEnrich.test.ts
  can prove the resume/skip/error-handling behaviour with a fake planning
  check — no real network needed to trust this part.

  Run: node --use-system-ca --env-file=.env --experimental-strip-types puller/sweepEnrich.ts [inFile]
  Needs egress to planning.southwark.gov.uk (no API key). See puller/README.md
  for why --use-system-ca is required on a corporate network.
*/

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { checkPlanningForAddress } from './planning.ts'
import { sleep } from './netEnv.ts'
import { buildCandidateGraph, rankCandidates, type SweepRecord } from './sweep.ts'
import { SECTOR_LABEL } from './sector.ts'
import { DEFAULT_SWEEP_FILE } from './sweepDiscover.ts'

// Confirmed live: firing planning checks back-to-back tripped Southwark's
// rate limit around the 7th candidate. checkPlanningForAddress's own 429
// retry (planning.ts) is the safety net; this pacing is the primary fix —
// spacing candidates out so a burst doesn't happen in the first place.
const MIN_DELAY_MS = 3000
const MAX_DELAY_MS = 5000

export interface EnrichmentPassOptions {
  /** Defaults to the real checkPlanningForAddress; overridable so tests can
   *  prove the resume/skip/error logic without a real network call. */
  checkPlanning?: typeof checkPlanningForAddress
  /** Called after EVERY candidate's record is updated — production wires
   *  this to rewrite the whole file, which is what makes a kill-and-resume
   *  safe. Defaults to a no-op. */
  onRecordSaved?: (records: SweepRecord[]) => void
  /** Defaults to a real 3-5s random wait; tests override with () => 0. */
  delayMs?: () => number
  log?: (msg: string) => void
}

/**
 * Process every PENDING record (planning === undefined) in order: one
 * checkPlanningForAddress call, paced by delayMs between candidates (never
 * before the first), with onRecordSaved fired after each one so the caller
 * can persist progress incrementally. Records that already have a
 * `planning` result are left untouched — this IS the resume behaviour: call
 * this again with a partially-done array and only the rest gets processed.
 * A candidate with no address, or whose check throws, still gets a
 * `planning` result (checked: false with a reason) so it's never retried
 * forever and never silently missing from the file.
 */
export async function runEnrichmentPass(records: SweepRecord[], opts: EnrichmentPassOptions = {}): Promise<number> {
  const checkPlanning = opts.checkPlanning ?? checkPlanningForAddress
  const onRecordSaved = opts.onRecordSaved ?? (() => {})
  const delayMs = opts.delayMs ?? (() => MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS))
  const log = opts.log ?? console.log

  let checkedThisRun = 0
  for (const record of records) {
    if (record.planning !== undefined) continue // already done — resumable

    if (checkedThisRun > 0) await sleep(delayMs())
    checkedThisRun++

    const name = record.enriched.hit.company_name
    if (!record.address) {
      log(`  ${name}: no address on file — skipping planning, marking processed`)
      record.planning = { checked: false, variantsUsed: [], matches: [], error: 'no address on file for this candidate' }
      onRecordSaved(records)
      continue
    }

    log(`  ${name} (${record.address}) — checking planning…`)
    try {
      record.planning = await checkPlanning(record.address)
      if (!record.planning.checked) log(`    inconclusive: ${record.planning.error}`)
      else log(`    ${record.planning.matches.length} match(es) via ${record.planning.variantsUsed.join(' + ')}${record.planning.error ? ` (⚠ ${record.planning.error})` : ''}`)
    } catch (err) {
      record.planning = { checked: false, variantsUsed: [], matches: [], error: (err as Error).message }
      log(`    failed: ${(err as Error).message}`)
    }
    onRecordSaved(records) // this is what makes a kill-and-resume safe — every candidate lands on disk immediately
  }
  return checkedThisRun
}

function printReport(records: SweepRecord[]): void {
  const asOf = new Date().toISOString().slice(0, 10)
  const results = records.map((r) => buildCandidateGraph(r.enriched, { matchedPlanning: r.planning ? r.planning.matches : null }))
  const ranked = rankCandidates(results, asOf)

  console.log(`\n${'═'.repeat(70)}\n${ranked.length} clusters, ranked (commercial/conversion first, nothing discarded):\n`)
  for (const { result, conclusion, rank } of ranked) {
    const tag = result.conversion.isConversion ? 'CONVERSION SIGNAL' : SECTOR_LABEL[result.sector.sector]
    console.log(`▸ [${conclusion.strength.toUpperCase()}] rank ${rank} · ${tag} · ${conclusion.headline}`)
    console.log(`    ${conclusion.reasoning}`)
    console.log(`    sector basis: ${result.sector.basis} (${result.sector.confidence})`)
    console.log(`    conversion: ${result.conversion.reason}`)
    console.log(`    planning: ${result.planningChecked ? 'checked (see evidence above for any match)' : 'not checked'}`)
    console.log('')
  }
}

async function main() {
  const file = process.argv[2] ?? DEFAULT_SWEEP_FILE
  if (!existsSync(file)) {
    console.error(`No such file: ${file}. Run sweepDiscover.ts first (it writes ${DEFAULT_SWEEP_FILE} by default).`)
    process.exit(1)
  }

  const records: SweepRecord[] = JSON.parse(readFileSync(file, 'utf8'))
  const pending = records.filter((r) => r.planning === undefined)
  console.log(`Part 1, stage 2 — enrichment (planning, one at a time)\n`)
  console.log(`${records.length} candidates total, ${records.length - pending.length} already checked, ${pending.length} pending.\n`)

  const checkedThisRun = await runEnrichmentPass(records, {
    onRecordSaved: (r) => writeFileSync(file, JSON.stringify(r, null, 2)),
  })

  console.log(`\nAll ${records.length} candidates now have a planning result (${checkedThisRun} checked this run).`)
  printReport(records)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('\nEnrichment could not complete:\n  ' + (err as Error).message)
    console.error('Whatever was already saved to the file is safe — re-run this script to resume.')
    process.exit(1)
  })
}
