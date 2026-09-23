/*
  Planning history — verification, per the brief's own test.

  Run: node --env-file=.env --experimental-strip-types puller/planningCheck.ts

  Two known cases, both run:
   1. 68 Borough Road (The Ship — pub, refurbished/reopened 2023 by True Pub
      Co; the sweep's false positive). Expected: no development planning
      application, or only minor/hospitality consents.
   2. 38-48 Southwark Bridge Road (the confirmed real case). Expected: a real
      application on record (the 2026 resubmission to co-living) — should
      light the planning cell.

  The source is working correctly when the pub stays quiet and the real case
  lights up. That contrast IS the proof — same shape as the 489-day
  cross-check that proved the graph engine. This does NOT run before
  planning-probe.ts has confirmed the search actually returns real result
  pages; if this CLI reports "not found" for BOTH addresses, run the probe
  before concluding anything about either building.
*/

import { checkPlanningForAddress, APPLICATION_TYPE_STRENGTH } from './planning.ts'
import { SOUTHWARK_BRIDGE_ROAD_SEED as SEED } from '../signal-model/seed.ts'
import { fileURLToPath } from 'node:url'

interface VerificationCase {
  label: string
  address: string
  expectation: 'shouldStayQuiet' | 'shouldLightUp'
}

const CASES: VerificationCase[] = [
  {
    label: 'The Ship — false-positive check',
    address: '68 Borough Road',
    expectation: 'shouldStayQuiet',
  },
  {
    label: `${SEED.address} — confirmed real case`,
    address: SEED.address,
    expectation: 'shouldLightUp',
  },
]

async function runCase(c: VerificationCase): Promise<void> {
  console.log(`\n${'═'.repeat(70)}\n${c.label}\n  address: ${c.address}\n  expectation: ${c.expectation === 'shouldStayQuiet' ? 'no strong planning signal' : 'a real application on record'}`)

  const result = await checkPlanningForAddress(c.address)

  if (!result.checked) {
    console.log(`\n  ⚠ COULD NOT CHECK — ${result.error}`)
    console.log('  This is NOT the same as "confirmed no application". Run planning-probe.ts first.')
    return
  }

  console.log(`  (searched via: ${result.variantUsed})`)

  if (result.matches.length === 0) {
    const verdict = c.expectation === 'shouldStayQuiet' ? 'PASS' : 'FAIL — investigate address-matching or the source query before trusting this'
    console.log(`\n  No matching applications found. → ${verdict}`)
    return
  }

  console.log(`\n  ${result.matches.length} matching application(s):`)
  let strongest = result.matches[0]
  for (const m of result.matches) {
    console.log(`    · ${m.reference || '(no ref)'} [${m.applicationType}] ${m.dateText ?? '(no date)'} — ${m.description}`)
    console.log(`      ${m.detailUrl}`)
    if (APPLICATION_TYPE_STRENGTH[m.applicationType] > APPLICATION_TYPE_STRENGTH[strongest.applicationType]) strongest = m
  }

  const isStrong = APPLICATION_TYPE_STRENGTH[strongest.applicationType] >= APPLICATION_TYPE_STRENGTH.changeOfUse
  if (c.expectation === 'shouldStayQuiet') {
    const verdict = isStrong
      ? `SURPRISE — a ${strongest.applicationType} application was found. Verify before trusting; this contradicts the known case.`
      : 'PASS — only weak/minor consents, as expected for ordinary commerce.'
    console.log(`\n  → ${verdict}`)
  } else {
    const verdict = isStrong
      ? `PASS — a ${strongest.applicationType} application lights up the planning cell, as expected.`
      : 'weak match only — a real application should be here (the 2026 co-living resubmission). Check address-matching before trusting.'
    console.log(`\n  → ${verdict}`)
  }
}

async function main() {
  console.log('Planning history verification — the pub vs. the real case\n')
  console.log('Source checked in the brief\'s preference order:')
  console.log('  1. southwark.gov.uk/download-our-planning-datasets — unreachable from the sandbox that wrote this; check manually.')
  console.log('  2. Planning London Datahub (GLA) — unreachable from the sandbox that wrote this; check manually.')
  console.log('  3. Idox Public Access address search — what this CLI actually runs.')

  for (const c of CASES) await runCase(c)

  console.log(`\n${'═'.repeat(70)}`)
  console.log('The source is working correctly when the pub stayed quiet and the real')
  console.log('case lit up. If both came back empty, run planning-probe.ts first — that')
  console.log('distinguishes "confirmed nothing" from "the search itself needs fixing".')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('\nPlanning check could not complete:\n  ' + (err as Error).message)
    console.error('\nNo verdict is reported because nothing was measured. (Not fabricated.)')
    process.exit(1)
  })
}
