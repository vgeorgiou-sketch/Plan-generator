/*
  Part 1, stage 1 — discovery: Companies House ONLY, no planning at all.

  Splits the old one-shot sweep.ts into two stages (see sweep.ts's file
  header for the two live failures that forced this split — a rate limit,
  then a cross-candidate session-isolation bug — both specific to firing
  Southwark planning searches in a burst). Companies House has shown neither
  problem, so this stage does the SIC × Southwark × recent-incorporation
  discovery and the full per-candidate enrichment (PSC, charges, officers,
  filing history) in one straightforward pass, and writes every candidate to
  a JSON file. sweepEnrich.ts reads that file and adds planning afterwards,
  slowly, in a separate run.

  Run: node --env-file=.env --experimental-strip-types puller/sweepDiscover.ts [outFile]
  Needs CH_API_KEY + egress. Defaults to writing sweep-candidates.json in the
  current directory; pass a path to use a different location.
*/

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { findSouthwarkRealEstateCandidates } from './spvScan.ts'
import { enrichCandidate, candidateAddress, type SweepRecord } from './sweep.ts'

export const DEFAULT_SWEEP_FILE = 'sweep-candidates.json'

async function main() {
  const outFile = process.argv[2] ?? DEFAULT_SWEEP_FILE
  console.log('Part 1, stage 1 — discovery (Companies House only)\n')

  const candidates = await findSouthwarkRealEstateCandidates({ location: 'southwark', monthsBack: 12 })
  console.log(`${candidates.length} candidate entities (SIC × Southwark × 12 months, deduped)\n`)
  if (candidates.length === 0) {
    console.log('No candidates found. A valid kill — or the filters need widening. Nothing written.')
    return
  }

  const records: SweepRecord[] = []
  for (const hit of candidates) {
    console.log(`  enriching ${hit.company_name} (${hit.company_number})…`)
    const enriched = await enrichCandidate(hit)
    records.push({ enriched, address: candidateAddress(enriched) })
  }

  writeFileSync(outFile, JSON.stringify(records, null, 2))
  console.log(`\nWrote ${records.length} candidates to ${outFile}.`)
  console.log('Next: node --use-system-ca --env-file=.env --experimental-strip-types puller/sweepEnrich.ts ' + outFile)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('\nDiscovery could not complete:\n  ' + (err as Error).message)
    console.error('\nNothing written because nothing was confirmed. (Not fabricated.)')
    process.exit(1)
  })
}
